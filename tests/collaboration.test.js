import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { createStore } from "../server/store.js";
import { Models } from "../.cache/tide-policy-runtime.mjs";

// Authentication is injected for these HTTP authorization/workflow tests.
// Actual JWT signatures and DPoP have separate tests. Policy signatures below
// are dummy fixtures: the real ORK cryptographic acceptance remains a live check.
async function setup(t) {
  const store = await createStore();
  const config = {
    mode: "tide",
    origin: "http://localhost:3000",
    requireDPoP: false,
    adapter: {
      "auth-server-url": "https://tide.example",
      realm: "studio",
      resource: "creatorroom",
      vendorId: "vendor",
      jwk: { keys: [{}] },
    },
  };
  const app = createApp({
    config,
    store,
    verifyToken: async (_adapter, token) => ({
      sub: token,
      exp: Math.floor(Date.now() / 1000) + 3600,
      tideuserkey: `key-${token}`,
      realm_access: {
        roles: token === "operator" ? ["creatorroom_operator"] : [],
      },
      resource_access:
        token === "admin"
          ? { "realm-management": { roles: ["tide-realm-admin"] } }
          : {},
    }),
  });
  const server = createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(
    () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, user = "alice", method = "GET", body) => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        ...(user ? { Authorization: `Bearer ${user}` } : {}),
        ...(body !== undefined
          ? { "Content-Type": "application/json", Origin: config.origin }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  for (const u of ["alice", "bob", "charlie", "admin", "operator"])
    assert.equal((await request("/me", u)).status, 200);
  return { store, request };
}
function signedPolicy(assetId, personId, hours = 1) {
  const p = new Models.Policy({
    version: Models.Policy.latestVersion,
    contractId: "RelationshipAttestation:1",
    modelId: ["PolicyEnabledEncryption:1", "PolicyEnabledDecryption:1"],
    keyId: "vendor",
    approvalType: Models.ApprovalType.IMPLICIT,
    executionType: Models.ExecutionType.PRIVATE,
    params: new Map([
      ["subjectType", "User"],
      ["subjectId", `key-${personId}`],
      ["assignmentId", assetId],
      ["roles", JSON.stringify(["_tide_encryptor", "_tide_decryptor"])],
    ]),
    expiry: Math.floor(Date.now() / 1000) + hours * 3600,
  });
  p.signature = new Uint8Array(64).fill(1);
  return Buffer.from(p.toBytes()).toString("base64");
}
async function reserve(request, user = "alice", projectId) {
  if (!projectId)
    projectId = (
      await request("/projects", user, "POST", { title: "Unreleased project" })
    ).data.project.id;
  const result = await request(`/projects/${projectId}/assets`, user, "POST", {
    title: "Draft",
    mime: "text/plain",
    size: 20,
  });
  assert.equal(result.status, 201);
  return { projectId, asset: result.data.asset };
}
async function ready(request, user = "alice", projectId) {
  const row = await reserve(request, user, projectId);
  const q = await request(
    `/assets/${row.asset.id}/policy-requests`,
    user,
    "POST",
    { hours: 1 },
  );
  assert.equal(q.status, 201);
  const policy = signedPolicy(row.asset.id, user);
  assert.equal(
    (
      await request(
        `/approvals/${q.data.approval.id}/approve`,
        "admin",
        "POST",
        { policyBase64: policy },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/assets/${row.asset.id}/content`, user, "PUT", {
        policyBase64: policy,
        envelope: {
          scheme: "tide-policy-v1",
          ciphertext: randomBytes(100).toString("base64"),
        },
      })
    ).status,
    200,
  );
  return row;
}

test("display name persists by authenticated subject and profile cannot assign roles", async (t) => {
  const { store, request } = await setup(t);
  assert.equal(
    (await request("/profile", "bob", "PATCH", { displayName: "Jamie" }))
      .status,
    200,
  );
  assert.equal((await request("/me", "bob")).data.user.name, "Jamie");
  assert.equal((await request("/me", "bob")).data.user.hasDisplayName, true);
  assert.notEqual((await request("/me", "alice")).data.user.name, "Jamie");
  assert.equal(
    (
      await request("/profile", "bob", "PATCH", {
        displayName: "Admin",
        role: "operator",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/profile", "bob", "PATCH", {
        displayName: "Admin",
        id: "alice",
      })
    ).status,
    400,
  );
  assert.equal(store.read().profiles.length, 1);
  const p = await request("/projects", "bob", "POST", { title: "B owns this" });
  assert.equal(p.status, 201);
  assert.equal(p.data.project.ownerId, "bob");
  assert.equal(
    (
      await request(`/projects/${p.data.project.id}`, "alice", "PATCH", {
        title: "Stolen",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/projects/${p.data.project.id}`, "bob", "PATCH", {
        title: "Updated",
        description: "Context",
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/projects", "operator", "POST", { title: "Operator" }))
      .status,
    403,
  );
});

test("ordinary owner cannot upload before policy approval; admin is not made owner", async (t) => {
  const { request, store } = await setup(t);
  const { asset } = await reserve(request);
  const policy = signedPolicy(asset.id, "alice"),
    envelope = {
      scheme: "tide-policy-v1",
      ciphertext: randomBytes(100).toString("base64"),
    };
  assert.equal(
    (
      await request(`/assets/${asset.id}/content`, "alice", "PUT", {
        policyBase64: policy,
        envelope,
      })
    ).status,
    403,
  );
  const q = (
    await request(`/assets/${asset.id}/policy-requests`, "alice", "POST", {
      hours: 1,
    })
  ).data.approval;
  assert.equal(
    (
      await request(`/approvals/${q.id}/approve`, "alice", "POST", {
        policyBase64: policy,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/approvals/${q.id}/approve`, "admin", "POST", {
        policyBase64: signedPolicy(asset.id, "bob"),
      })
    ).status,
    400,
  );
  assert.equal(
    (await request(`/approvals/${q.id}/approve`, "admin", "POST", {
      policyBase64: signedPolicy(asset.id, "alice", 24),
    })).status,
    400,
    "a one-hour request cannot receive a 24-hour policy",
  );
  assert.equal(
    (
      await request(`/approvals/${q.id}/approve`, "admin", "POST", {
        policyBase64: policy,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/assets/${asset.id}/content`, "alice", "PUT", {
        policyBase64: policy,
        envelope,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`/assets/${asset.id}/open`, "admin")).status,
    403,
  );
  assert.equal(store.read().projects[0].ownerId, "alice");
});

test("invitation is single-use, requires owner confirmation and per-draft signed approval", async (t) => {
  const { request, store } = await setup(t);
  const a = await ready(request);
  const b = await ready(request, "alice", a.projectId);
  assert.ok(
    !(await request("/projects", "bob")).data.projects.some(
      (p) => p.id === a.projectId,
    ),
  );
  const created = await request(
    `/projects/${a.projectId}/invitations`,
    "alice",
    "POST",
    { assetIds: [a.asset.id] },
  );
  assert.equal(created.status, 201);
  const token = created.data.url.split("/").pop(),
    id = created.data.invitation.id;
  assert.equal(
    (await request(`/invitations/token/${token}`, null)).status,
    200,
  );
  assert.ok(
    !JSON.stringify(store.read()).includes(token),
    "store contains only token hash",
  );
  const claims = await Promise.all([
    request(`/invitations/token/${token}/accept`, "bob", "POST", {}),
    request(`/invitations/token/${token}/accept`, "charlie", "POST", {}),
  ]);
  assert.deepEqual(claims.map((r) => r.status).sort(), [200, 409]);
  const winner = claims[0].status === 200 ? "bob" : "charlie";
  assert.equal(
    (await request(`/assets/${a.asset.id}/open`, winner)).status,
    403,
  );
  assert.equal(
    (await request(`/invitations/${id}/confirm`, winner, "POST", {})).status,
    403,
  );
  assert.equal(
    (await request(`/invitations/${id}/confirm`, "alice", "POST", {})).status,
    200,
  );
  const q = (await request("/approvals", "admin")).data.approvals.find(
    (r) => r.invitationId === id,
  );
  assert.equal(
    (
      await request(`/approvals/${q.id}/approve`, "admin", "POST", {
        policyBase64: signedPolicy(a.asset.id, winner),
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`/assets/${a.asset.id}/open`, winner)).status,
    200,
  );
  assert.equal(
    (await request(`/assets/${b.asset.id}/open`, winner)).status,
    403,
  );
  assert.equal(
    (await request(`/invitations/${id}`, "alice", "DELETE", {})).status,
    200,
  );
  assert.equal(
    (await request(`/assets/${a.asset.id}/open`, winner)).status,
    403,
  );
  assert.equal(
    (await request(`/invitations/token/${token}/accept`, winner, "POST", {}))
      .status,
    409,
  );
});

test("expired and cancelled invitations cannot grant access or be revived by late approval", async (t) => {
  const { request, store } = await setup(t);
  const a = await ready(request);
  const invite = async () =>
    request(`/projects/${a.projectId}/invitations`, "alice", "POST", {
      assetIds: [a.asset.id],
    });
  const first = await invite();
  const id = first.data.invitation.id,
    token = first.data.url.split("/").pop();
  await store.mutate((s) => {
    s.invitations.find((i) => i.id === id).expiresAt = new Date(
      0,
    ).toISOString();
  });
  assert.equal(
    (await request(`/invitations/token/${token}/accept`, "bob", "POST", {}))
      .status,
    410,
  );
  const next = await invite();
  const token2 = next.data.url.split("/").pop(),
    id2 = next.data.invitation.id;
  await request(`/invitations/token/${token2}/accept`, "bob", "POST", {});
  await request(`/invitations/${id2}/confirm`, "alice", "POST", {});
  const q = (await request("/approvals", "admin")).data.approvals.find(
    (r) => r.invitationId === id2,
  );
  await request(`/invitations/${id2}`, "alice", "DELETE", {});
  assert.equal(
    (
      await request(`/approvals/${q.id}/approve`, "admin", "POST", {
        policyBase64: signedPolicy(a.asset.id, "bob"),
      })
    ).status,
    409,
  );
  assert.equal(
    (await request(`/assets/${a.asset.id}/open`, "bob")).status,
    403,
  );
});

test("v1 store migration preserves existing projects and adds collaboration collections", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "creatorroom-migration-")),
    file = join(dir, "data.json");
  t.after(async () => {
    await unlink(file);
    await rmdir(dir);
  });
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      people: [],
      projects: [{ id: "existing" }],
      assets: [],
      grants: [],
      comments: [],
      events: [],
    }),
  );
  const store = await createStore(file);
  assert.equal(store.read().projects[0].id, "existing");
  assert.deepEqual(store.read().invitations, []);
  assert.equal(store.read().version, 2);
  await Promise.all(Array.from({ length: 25 }, (_, i) => store.mutate((state) => {
    state.profiles.push({ id: `member-${i}`, displayName: `Member ${i}` });
  })));
  const persisted = JSON.parse(await readFile(file, "utf8"));
  assert.equal(persisted.profiles.length, 25);
  assert.equal(persisted.projects[0].id, "existing");
  assert.equal(persisted.version, 2);
});


test("rejecting one draft cancels the invitation and prevents a late partial grant", async (t) => {
  const { request } = await setup(t);
  const a = await ready(request);
  const b = await ready(request, "alice", a.projectId);
  const invitation = (await request(`/projects/${a.projectId}/invitations`, "alice", "POST", {
    assetIds: [a.asset.id, b.asset.id],
  })).data;
  const token = invitation.url.split("/").pop();
  await request(`/invitations/token/${token}/accept`, "bob", "POST", {});
  await request(`/invitations/${invitation.invitation.id}/confirm`, "alice", "POST", {});
  const rows = (await request("/approvals", "admin")).data.approvals.filter(
    (r) => r.invitationId === invitation.invitation.id,
  );
  assert.equal(rows.length, 2);
  assert.equal((await request(`/approvals/${rows[0].id}/reject`, "admin", "POST", {})).status, 200);
  assert.equal((await request(`/approvals/${rows[1].id}/approve`, "admin", "POST", {
    policyBase64: signedPolicy(rows[1].assetId, "bob"),
  })).status, 409);
  assert.equal((await request(`/invitations/token/${token}`, null)).data.invitation.status, "rejected");
  assert.equal((await request(`/assets/${a.asset.id}/open`, "bob")).status, 403);
  assert.equal((await request(`/assets/${b.asset.id}/open`, "bob")).status, 403);
});
