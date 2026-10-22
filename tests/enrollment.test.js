import test from "node:test";
import assert from "node:assert/strict";
import { prepareMemberEnrollment } from "../src/lib/enrollment.js";

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
  const request = async (_config, path, method = "GET", body) => {
    calls.push({ path, method, body });
    if (path === "/users/member" && method === "GET")
      return {
        id: "member",
        username: "creator-a",
        attributes: { preference: ["keep"] },
      };
    if (path.endsWith("/committed"))
      return { committed, tideInvitable: invitable };
    if (path === "/iga/change-requests?status=PENDING")
      return structuredClone(pending);
    if (path === "/iga/adopt") {
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
    if (id === "adopt") committed = true;
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
test("member enrollment leaves pre-existing and unrelated governance requests untouched", async (t) => {
  browser(t);
  const f = fixture({ existing: true });
  await assert.rejects(
    prepareMemberEnrollment(config, "member", f),
    /pending change/,
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
