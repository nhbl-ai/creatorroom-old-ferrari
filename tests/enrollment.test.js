import test from "node:test";
import assert from "node:assert/strict";
import { prepareMemberEnrollment } from "../src/lib/enrollment.js";
import {
  approveGovernance,
  ensureCryptoRoles,
} from "../src/lib/tide-admin.js";

// Orchestration fixtures only: no real token, enclave signature or ORK acceptance.
const config = {
  mode: "tide",
  adapter: {
    realm: "studio",
    resource: "creatorroom",
    "auth-server-url": "http://localhost:8080",
  },
};
function fixture({
  existing = false,
  createPending = false,
  foreign = false,
  unexpected = false,
  badUrl = false,
} = {}) {
  let committed = false,
    invitable = false;
  const calls = [],
    approved = [];
  let pending = [
    {
      id: "unrelated",
      entityId: "other",
      actionType: "GRANT_ROLES",
      status: "PENDING",
    },
  ];
  if (existing)
    pending.push({
      id: "previous",
      entityId: "member",
      actionType: "ADOPT_USER",
      status: "PENDING",
    });
  if (createPending)
    pending.push({
      id: "create",
      entityId: "member",
      actionType: "CREATE_USER",
      rows: [{ ID: "member", USERNAME: "creator-a" }],
      status: "PENDING",
    });
  if (foreign)
    pending.push({
      id: "foreign",
      entityId: "member",
      actionType: "REMOVE_USER_ATTRIBUTE",
      status: "PENDING",
    });
  const request = async (_config, path, method = "GET", body) => {
    calls.push({ path, method, body });
    if (path === "/users/member" && method === "GET")
      return {
        id: "member",
        username: "creator-a",
        firstName: "Creator",
        email: "a@example.test",
        attributes: { preference: ["keep"] },
      };
    if (path.endsWith("/committed"))
      return { committed, tideInvitable: invitable };
    if (path === "/iga/change-requests?status=PENDING")
      return structuredClone(pending);
    if (path === "/iga/adopt") {
      assert.ok(!createPending, "approve CREATE_USER instead of adopting");
      pending.push({
        id: "adopt",
        entityId: "member",
        actionType: unexpected ? "GRANT_ROLES" : "ADOPT_USER",
        rows: [],
        status: "PENDING",
      });
      return { id: "adopt" };
    }
    if (path === "/users/member" && method === "PUT") {
      assert.deepEqual(body.attributes, {
        preference: ["keep"],
        tideInvitable: ["true"],
      });
      // A partial PUT would clear names and file REMOVE_USER_ATTRIBUTE rows.
      assert.equal(body.firstName, "Creator");
      assert.equal(body.email, "a@example.test");
      pending.push({
        id: "invite",
        entityId: "member",
        actionType: "SET_USER_ATTRIBUTE",
        rows: [{ NAME: "tideInvitable", VALUE: "true" }],
        status: "PENDING",
      });
      return {};
    }
    if (path.startsWith("/tideAdminResources/get-required-action-link?")) {
      assert.deepEqual(body, ["link-tide-account-action"]);
      const params = new URLSearchParams(path.split("?")[1]);
      assert.equal(params.get("client_id"), "creatorroom");
      assert.equal(params.get("redirect_uri"), "http://localhost:3000/");
      assert.equal(params.get("lifespan"), "1800");
      assert.ok(
        committed && invitable,
        "issue the link only after applied governance changes",
      );
      return `${badUrl ? "https://attacker.invalid" : "http://localhost:8080"}/realms/studio/login-actions/action-token?key=fixture-only`;
    }
    throw new Error("Unexpected request: " + method + " " + path);
  };
  const approve = async (_config, id) => {
    approved.push(id);
    if (["adopt", "previous", "create"].includes(id)) committed = true;
    if (id === "invite") invitable = true;
    pending = pending.filter((r) => r.id !== id);
  };
  return { request, approve, calls, approved };
}
function browser(t) {
  const previous = globalThis.window;
  globalThis.window = { location: { origin: "http://localhost:3000" } };
  t.after(() => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  });
}
test("member enrollment adopts, commits invitation permission and returns a private SDK link without admin role grants", async (t) => {
  browser(t);
  const f = fixture();
  const url = await prepareMemberEnrollment(config, "member", f);
  assert.match(
    url,
    /^http:\/\/localhost:8080\/realms\/studio\/login-actions\/action-token/,
  );
  assert.deepEqual(f.approved, ["adopt", "invite"]);
  assert.ok(!f.calls.some((c) => /role-mappings/.test(c.path)));
});
test("member enrollment resumes this member's pending adoption and leaves unrelated requests untouched", async (t) => {
  browser(t);
  const f = fixture({ existing: true });
  await prepareMemberEnrollment(config, "member", f);
  assert.deepEqual(f.approved, ["previous", "invite"]);
  assert.ok(!f.calls.some((c) => c.path === "/iga/adopt"));
});
test("member registered before sign-up was enabled is admitted by approving CREATE_USER", async (t) => {
  browser(t);
  const f = fixture({ createPending: true });
  await prepareMemberEnrollment(config, "member", f);
  assert.deepEqual(f.approved, ["create", "invite"]);
});
test("member enrollment refuses when the member has an unrelated pending change", async (t) => {
  browser(t);
  const f = fixture({ foreign: true });
  await assert.rejects(
    prepareMemberEnrollment(config, "member", f),
    /another pending change/,
  );
  assert.deepEqual(f.approved, []);
  assert.ok(!f.calls.some((c) => c.method !== "GET"));
});
test("member enrollment refuses an unexpected newly created governance action", async (t) => {
  browser(t);
  const f = fixture({ unexpected: true });
  await assert.rejects(
    prepareMemberEnrollment(config, "member", f),
    /Unexpected governance change/,
  );
  assert.deepEqual(f.approved, []);
  assert.ok(
    !f.calls.some((c) =>
      c.path.startsWith("/tideAdminResources/get-required-action-link?"),
    ),
  );
});
test("member enrollment never displays an action-token URL from another origin", async (t) => {
  browser(t);
  const f = fixture({ badUrl: true });
  await assert.rejects(
    prepareMemberEnrollment(config, "member", f),
    /unexpected enrollment URL/,
  );
});

// TideCloak files GRANT_ROLES inline and returns 204 with no Location.
function roleFixture({ committed = true } = {}) {
  const roles = ["_tide_enabled", "_tide_encryptor", "_tide_decryptor"].map(
    (name) => ({ id: `id${name}`, name }),
  );
  let owned = [{ id: "d", name: "default-roles-studio" }],
    pending = [
      { id: "other", entityId: "someone", actionType: "GRANT_ROLES", rows: [] },
    ],
    n = 0;
  const approved = [];
  const request = async (_c, path, method = "GET", body) => {
    if (path.endsWith("/committed")) return { committed, tideInvitable: true };
    if (path === "/roles") return roles;
    if (path === "/iga/change-requests?status=PENDING")
      return structuredClone(pending);
    if (path === "/users/member/role-mappings/realm" && method === "GET")
      return structuredClone(owned);
    if (path === "/users/member/role-mappings/realm" && method === "POST") {
      assert.equal(body.length, 1);
      pending.push({
        id: `grant${++n}`,
        entityId: "member",
        actionType: "GRANT_ROLES",
        rows: [{ USER_ID: "member", ROLE_ID: body[0].id }],
        role: body[0],
      });
      return {};
    }
    throw new Error("Unexpected request: " + method + " " + path);
  };
  const approve = async (_c, id) => {
    approved.push(id);
    const row = pending.find((r) => r.id === id);
    owned.push(row.role);
    pending = pending.filter((r) => r.id !== id);
    return { mode: "recorded", committed: true };
  };
  return { request, approve, approved };
}
test("crypto role grants are found by diffing pending requests (204 responses)", async () => {
  const f = roleFixture();
  await ensureCryptoRoles(config, "member", f);
  assert.deepEqual(f.approved, ["grant1", "grant2", "grant3"]);
});
test("crypto roles are not granted before the member is committed", async () => {
  const f = roleFixture({ committed: false });
  await assert.rejects(
    ensureCryptoRoles(config, "member", f),
    /not linked to Tide yet/,
  );
  assert.deepEqual(f.approved, []);
});

// multiAdmin /approve cannot build an enclave model for ADOPT_* ("Unknown IGA
// action: ADOPT_USER"); TideCloak's exempt lane is authorize + commit.
function laneFixture({ alreadySigned = false } = {}) {
  const calls = [];
  const request = async (_c, path, method = "GET") => {
    calls.push(`${method} ${path}`);
    if (path.endsWith("/authorize") && alreadySigned) {
      const error = new Error(
        "Tide could not complete this operation (409). Caller has already signed this change request",
      );
      error.status = 409;
      throw error;
    }
    if (path.endsWith("/authorize")) return { status: "PENDING" };
    if (path.endsWith("/commit"))
      return { committed: true, changeRequestId: "adopt", status: "APPROVED" };
    throw new Error("Unexpected request: " + method + " " + path);
  };
  return { request, calls };
}
test("ADOPT_USER is approved through authorize + commit, never the enclave /approve", async () => {
  const f = laneFixture();
  const result = await approveGovernance(config, "adopt", "ADOPT_USER", f);
  assert.deepEqual(f.calls, [
    "POST /iga/change-requests/adopt/authorize",
    "POST /iga/change-requests/adopt/commit",
  ]);
  assert.equal(result.committed, true);
});
test("an adoption this admin already authorized is resumed by committing it", async () => {
  const f = laneFixture({ alreadySigned: true });
  const result = await approveGovernance(config, "adopt", "ADOPT_USER", f);
  assert.equal(f.calls.at(-1), "POST /iga/change-requests/adopt/commit");
  assert.equal(result.committed, true);
});
test("other governance actions still use the /approve lane", async () => {
  const calls = [];
  const request = async (_c, path, method) => {
    calls.push(`${method} ${path}`);
    return { mode: "recorded", committed: true };
  };
  await approveGovernance(config, "grant", "GRANT_ROLES", { request });
  assert.deepEqual(calls, ["POST /iga/change-requests/grant/approve"]);
});
