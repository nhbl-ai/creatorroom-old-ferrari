import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, generateKeyPairSync, sign } from "node:crypto";
import { createServer } from "node:http";
import { createApp } from "../server/app.js";
import { createStore } from "../server/store.js";
import { publicAdapter } from "../server/config.js";
import { validatePolicy } from "../server/policies.js";
import { Models } from "../.cache/tide-policy-runtime.mjs";

const origin = "http://localhost:3000";
const demoEnvelope = () => ({
  scheme: "local-demo-v1",
  ciphertext: randomBytes(80).toString("base64"),
  iv: randomBytes(12).toString("base64"),
  keyId: "test-key-reference",
});

async function harness(t, configuration = { mode: "demo", origin }) {
  const store = await createStore();
  const app = createApp({ config: configuration, store });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(
    path,
    { cookie, token, body, method = "GET", headers = {} } = {},
  ) {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined
          ? { "Content-Type": "application/json", Origin: origin }
          : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  async function login(personId) {
    const result = await request("/demo/session", {
      method: "POST",
      body: { personId },
    });
    assert.equal(result.status, 200);
    return result.cookie;
  }
  return { request, login, store };
}

async function draft(request, cookie, title = "Private draft") {
  const project = await request("/projects", {
    cookie,
    method: "POST",
    body: { title: "Test studio", color: "lavender" },
  });
  assert.equal(project.status, 201);
  const asset = await request(`/projects/${project.data.project.id}/assets`, {
    cookie,
    method: "POST",
    body: { title, mime: "image/png", size: 100 },
  });
  assert.equal(asset.status, 201);
  const result = await request(`/assets/${asset.data.asset.id}/content`, {
    cookie,
    method: "PUT",
    body: { envelope: demoEnvelope(), policyBase64: null },
  });
  assert.equal(result.status, 200);
  return asset.data.asset.id;
}

test("creator/reviewer/operator workflow enforces asset scope and current invitations", async (t) => {
  const { request, login, store } = await harness(t);
  const owner = await login("demo-creator");
  const reviewer = await login("demo-reviewer");
  const operator = await login("demo-operator");
  const assetA = await draft(request, owner, "Draft A");
  const assetB = await draft(request, owner, "Draft B");

  assert.equal((await request(`/assets/${assetA}/open`)).status, 401);
  assert.equal(
    (await request(`/assets/${assetA}/open`, { cookie: reviewer })).status,
    403,
  );
  assert.equal(
    (await request(`/assets/${assetA}/comments`, { cookie: reviewer })).status,
    403,
  );
  const invitation = await request(`/assets/${assetA}/grants`, {
    cookie: owner,
    method: "POST",
    body: { personId: "demo-reviewer", policyBase64: null },
  });
  assert.equal(invitation.status, 201);
  const opened = await request(`/assets/${assetA}/open`, { cookie: reviewer });
  assert.equal(opened.status, 200);
  assert.equal(opened.data.envelope.scheme, "local-demo-v1");
  assert.ok(!("key" in opened.data.envelope));
  assert.equal(
    (await request(`/assets/${assetB}/open`, { cookie: reviewer })).status,
    403,
  );
  assert.equal(
    (await request(`/assets/${assetA}/open`, { cookie: operator })).status,
    403,
  );
  assert.equal((await request("/storage", { cookie: reviewer })).status, 403);

  const feedback = await request(`/assets/${assetA}/comments`, {
    cookie: reviewer,
    method: "POST",
    body: {
      id: "12345678-1234-1234-1234-123456789abc",
      envelope: demoEnvelope(),
    },
  });
  assert.equal(feedback.status, 201);
  assert.equal(
    (await request(`/assets/${assetA}/comments`, { cookie: owner })).data
      .comments.length,
    1,
  );
  const inspection = await request("/storage", { cookie: operator });
  assert.equal(inspection.status, 200);
  assert.equal(inspection.data.records.length, 3);
  assert.ok(
    inspection.data.records.every(
      (record) =>
        record.sha256.length === 64 && !record.plaintext && !record.key,
    ),
  );

  assert.equal(
    (
      await request(`/assets/${assetA}/grants/demo-reviewer`, {
        cookie: owner,
        method: "DELETE",
        body: {},
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`/assets/${assetA}/open`, { cookie: reviewer })).status,
    403,
    "the same reviewer session loses API access immediately",
  );
  assert.equal(
    (
      await request(`/assets/${assetA}/comments`, {
        cookie: reviewer,
        method: "POST",
        body: {
          id: "23456789-1234-1234-1234-123456789abc",
          envelope: demoEnvelope(),
        },
      })
    ).status,
    403,
  );
  assert.ok(store.read().events.some((event) => event.decision === "denied"));
});

test("roles cannot be supplied in headers or elevated through write routes", async (t) => {
  const { request, login } = await harness(t);
  const owner = await login("demo-creator");
  const reviewer = await login("demo-reviewer");
  const operator = await login("demo-operator");
  const asset = await draft(request, owner);
  assert.equal(
    (await request("/me", { headers: { "X-User": "demo-creator" } })).status,
    401,
  );
  assert.equal(
    (
      await request("/projects", {
        cookie: reviewer,
        method: "POST",
        body: { title: "Unauthorized" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/assets/${asset}/grants`, {
        cookie: operator,
        method: "POST",
        body: { personId: "demo-operator", policyBase64: null },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/assets/${asset}/grants`, {
        cookie: reviewer,
        method: "POST",
        body: { personId: "demo-reviewer", policyBase64: null },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/assets/${asset}/grants`, {
        cookie: owner,
        method: "POST",
        body: { personId: "demo-operator", policyBase64: null },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/demo/session", {
        method: "POST",
        body: { personId: "invented-admin" },
      })
    ).status,
    400,
  );
});

test("API rejects cross-origin writes, raw content, mismatched encryption modes and oversized files", async (t) => {
  const { request, login } = await harness(t);
  const owner = await login("demo-creator");
  assert.equal(
    (
      await request("/projects", {
        cookie: owner,
        method: "POST",
        body: { title: "Attack" },
        headers: { Origin: "https://other.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/projects", {
        cookie: owner,
        method: "POST",
        body: { title: "Attack" },
        headers: { "Content-Type": "text/plain" },
      })
    ).status,
    415,
  );
  const { data } = await request("/projects", {
    cookie: owner,
    method: "POST",
    body: { title: "Safe project" },
  });
  const projectId = data.project.id;
  assert.equal(
    (
      await request(`/projects/${projectId}/assets`, {
        cookie: owner,
        method: "POST",
        body: { title: "Too large", mime: "image/png", size: 1_000_001 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/projects/${projectId}/assets`, {
        cookie: owner,
        method: "POST",
        body: { title: "Active SVG", mime: "image/svg+xml", size: 10 },
      })
    ).status,
    400,
  );
  const created = await request(`/projects/${projectId}/assets`, {
    cookie: owner,
    method: "POST",
    body: { title: "New draft", mime: "text/plain", size: 100 },
  });
  const id = created.data.asset.id;
  assert.equal(
    (
      await request(`/assets/${id}/content`, {
        cookie: owner,
        method: "PUT",
        body: { envelope: { ...demoEnvelope(), key: "secret" } },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/assets/${id}/content`, {
        cookie: owner,
        method: "PUT",
        body: { plaintext: "should never be stored" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/assets/${id}/content`, {
        cookie: owner,
        method: "PUT",
        body: {
          envelope: {
            scheme: "tide-policy-v1",
            ciphertext: randomBytes(40).toString("base64"),
          },
        },
      })
    ).status,
    400,
  );
});

test("setup mode fails closed and public adapter omits secret fields", async (t) => {
  const { request } = await harness(t, { mode: "setup", origin });
  assert.equal((await request("/projects")).status, 503);
  assert.equal(
    (
      await request("/demo/session", {
        method: "POST",
        body: { personId: "demo-creator" },
      })
    ).status,
    404,
  );
  const cleaned = publicAdapter({
    realm: "test",
    resource: "app",
    vendorId: "public-vendor",
    credentials: { secret: "do not expose" },
    "client-secret": "hidden",
    "client-origin-auth-http://localhost:3000": "public origin data",
  });
  assert.ok(!cleaned.credentials && !cleaned["client-secret"]);
  assert.equal(
    cleaned["client-origin-auth-http://localhost:3000"],
    "public origin data",
  );
});

test("Tide mode verifies actual JWT signatures, issuer, client, expiry and role; it has no demo login", async (t) => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "test-only",
    alg: "ES256",
    use: "sig",
  };
  const config = {
    mode: "tide",
    origin,
    adapter: {
      "auth-server-url": "https://tide.example",
      realm: "studio",
      resource: "creatorroom",
      vendorId: "vendor",
      jwk: { keys: [jwk] },
    },
  };
  const { request } = await harness(t, config);
  function token(overrides = {}) {
    const header = Buffer.from(
      JSON.stringify({ alg: "ES256", kid: "test-only" }),
    ).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({
        sub: "real-subject",
        iss: "https://tide.example/realms/studio",
        azp: "creatorroom",
        exp: Math.floor(Date.now() / 1000) + 600,
        realm_access: { roles: ["creatorroom_reviewer"] },
        ...overrides,
      }),
    ).toString("base64url");
    const signature = sign("sha256", Buffer.from(`${header}.${body}`), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url");
    return `${header}.${body}.${signature}`;
  }
  assert.equal((await request("/me", { token: token() })).status, 200);
  assert.equal(
    (await request("/me", { token: token({ azp: "other-app" }) })).status,
    401,
  );
  assert.equal(
    (
      await request("/me", {
        token: token({ iss: "https://attacker.example" }),
      })
    ).status,
    401,
  );
  assert.equal(
    (await request("/me", { token: token({ exp: 1 }) })).status,
    401,
  );
  assert.equal(
    (await request("/me", { token: token({ exp: undefined }) })).status,
    401,
  );
  assert.equal(
    (await request("/me", { token: token({ realm_access: { roles: [] } }) }))
      .status,
    403,
  );
  assert.equal(
    (await request("/me", { token: token({ cnf: { jkt: "bound-token" } }) }))
      .status,
    401,
  );
  const invalidSignature = `${token().split(".").slice(0, 2).join(".")}.${randomBytes(64).toString("base64url")}`;
  assert.equal((await request("/me", { token: invalidSignature })).status, 401);
  assert.equal(
    (
      await request("/demo/session", {
        method: "POST",
        body: { personId: "demo-creator" },
      })
    ).status,
    404,
  );
  const mixedRole = await request("/me", {
    token: token({
      realm_access: {
        roles: [
          "creatorroom_operator",
          "creatorroom_creator",
          "tide-realm-admin",
        ],
      },
    }),
  });
  assert.equal(mixedRole.data.user.role, "operator");
  assert.equal(mixedRole.data.user.canSign, false);
  const creatorAdmin = await request("/me", {
    token: token({
      realm_access: { roles: ["creatorroom_creator"] },
      resource_access: { "realm-management": { roles: ["tide-realm-admin"] } },
    }),
  });
  assert.equal(
    creatorAdmin.data.user.canSign,
    true,
    "Tide admin is a realm-management client role",
  );
});

test("Tide policy parser checks record, subject, signature presence, model and expiry", async () => {
  const make = (overrides = {}) => {
    const p = new Models.Policy({
      version: Models.Policy.latestVersion,
      contractId: "RelationshipAttestation:1",
      modelId: ["PolicyEnabledEncryption:1", "PolicyEnabledDecryption:1"],
      keyId: "test-vendor",
      approvalType: Models.ApprovalType.IMPLICIT,
      executionType: Models.ExecutionType.PRIVATE,
      params: new Map([
        ["subjectType", "User"],
        ["subjectId", "reviewer-key"],
        ["assignmentId", "asset-a"],
        ["roles", JSON.stringify(["_tide_encryptor", "_tide_decryptor"])],
      ]),
      expiry: Math.floor(Date.now() / 1000) + 3600,
      ...overrides,
    });
    // A deliberately fake signature: this test checks parsing/scope only.
    // The ORK network must verify the real signature in the live acceptance run.
    p.signature = new Uint8Array(64).fill(1);
    return Buffer.from(p.toBytes()).toString("base64");
  };
  const context = {
    mode: "tide",
    assetId: "asset-a",
    person: { tideUserKey: "reviewer-key" },
    vendorId: "test-vendor",
  };
  const result = await validatePolicy(make(), context);
  assert.ok(result.expiresAt);
  await assert.rejects(
    validatePolicy(make(), { ...context, assetId: "asset-b" }),
    /does not match/,
  );
  await assert.rejects(
    validatePolicy(make(), {
      ...context,
      person: { tideUserKey: "someone-else" },
    }),
    /does not match/,
  );
  await assert.rejects(validatePolicy(make({ expiry: 1 }), context), /expiry/);
  await assert.rejects(
    validatePolicy(make({ modelId: ["PolicyEnabledEncryption:1"] }), context),
    /model/,
  );
});

test("serial store mutations do not lose concurrent writes and failed mutations do not commit", async () => {
  const store = await createStore();
  await Promise.all(
    Array.from({ length: 25 }, (_, index) =>
      store.mutate((state) => {
        state.projects.push({ id: index });
      }),
    ),
  );
  assert.equal(store.read().projects.length, 25);
  await assert.rejects(
    store.mutate((state) => {
      state.projects.push({ id: "must-not-save" });
      throw new Error("abort");
    }),
  );
  assert.equal(store.read().projects.length, 25);
});
