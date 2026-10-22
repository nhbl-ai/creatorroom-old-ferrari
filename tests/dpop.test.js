import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  calculateJwkThumbprint,
} from "jose";
import { createAuthenticator } from "../server/auth.js";
import { createApp } from "../server/app.js";
import { createStore } from "../server/store.js";
import { createServer } from "node:http";
import { DPOP_AUTH_HTML, dpopAuthPathFor } from "@tidecloak/js/dpop-server";

const origin = "http://localhost:3000";
const issuer = "https://tide.example/realms/studio";

test("strict Tide auth verifies signature and DPoP binding, request, time and replay", async () => {
  const realmKey = await generateKeyPair("EdDSA");
  const realmJwk = {
    ...(await exportJWK(realmKey.publicKey)),
    kid: "realm-key",
    alg: "EdDSA",
  };
  const browserKey = await generateKeyPair("ES256");
  const browserJwk = await exportJWK(browserKey.publicKey);
  const jkt = await calculateJwkThumbprint(browserJwk);
  const config = {
    mode: "tide",
    origin,
    requireDPoP: true,
    adapter: {
      "auth-server-url": "https://tide.example",
      realm: "studio",
      resource: "creatorroom",
      jwk: { keys: [realmJwk] },
      tokenSignatureAlgorithms: ["EdDSA"],
    },
  };
  const auth = createAuthenticator(config);
  async function access(overrides = {}) {
    return new SignJWT({
      azp: "creatorroom",
      realm_access: { roles: ["creatorroom_creator"] },
      cnf: { jkt },
      ...overrides,
    })
      .setProtectedHeader({ alg: "EdDSA", kid: "realm-key" })
      .setSubject("creator")
      .setIssuer(issuer)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(realmKey.privateKey);
  }
  const token = await access();
  async function proof(overrides = {}, forToken = token) {
    return new SignJWT({
      jti: randomUUID(),
      htm: "GET",
      htu: origin + "/api/me",
      iat: Math.floor(Date.now() / 1000),
      ath: createHash("sha256").update(forToken).digest("base64url"),
      ...overrides,
    })
      .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: browserJwk })
      .sign(browserKey.privateKey);
  }
  function request(tokenValue, proofValue, scheme = "DPoP", extra = {}) {
    const headers = {
      authorization: `${scheme} ${tokenValue}`,
      ...(proofValue ? { dpop: proofValue } : {}),
      ...extra,
    };
    return {
      originalUrl: "/api/me?sort=new",
      method: "GET",
      headers,
      get: (name) => headers[name.toLowerCase()],
    };
  }
  const valid = await proof();
  assert.equal(
    (await auth.authenticate(request(token, valid))).role,
    "creator",
  );
  await assert.rejects(auth.authenticate(request(token, valid)), {
    status: 401,
  });
  await assert.rejects(
    auth.authenticate(request(token, await proof(), "Bearer")),
    { status: 401 },
  );
  await assert.rejects(auth.authenticate(request(token)), { status: 401 });
  for (const bad of [
    { htm: "POST" },
    { htu: origin + "/api/assets/private" },
    { ath: "wrong-token" },
    { iat: Math.floor(Date.now() / 1000) - 601 },
    { iat: Math.floor(Date.now() / 1000) + 601 },
  ])
    await assert.rejects(auth.authenticate(request(token, await proof(bad))), {
      status: 401,
    });
  const wrongBinding = await access({ cnf: { jkt: "different-key" } });
  await assert.rejects(
    auth.authenticate(request(wrongBinding, await proof({}, wrongBinding))),
    { status: 401 },
  );
  const unbound = await access({ cnf: undefined });
  await assert.rejects(
    auth.authenticate(request(unbound, await proof({}, unbound))),
    { status: 401 },
  );
  // Forwarded headers from a direct client cannot choose the URL the API verifies.
  await assert.rejects(
    auth.authenticate(
      request(
        token,
        await proof({ htu: "https://evil.example/api/me" }),
        "DPoP",
        {
          "x-forwarded-host": "evil.example",
          "x-forwarded-proto": "https",
        },
      ),
    ),
    { status: 401 },
  );
});

test("DPoP relay serves SDK bytes and headers and refuses a different issuer or client", async (t) => {
  const config = {
    mode: "setup",
    origin,
    adapter: {
      "auth-server-url": "https://tide.example",
      realm: "studio",
      resource: "creatorroom",
    },
  };
  const app = createApp({ config, store: await createStore() });
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
  const response = await fetch(base + dpopAuthPathFor(issuer, "creatorroom"));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), DPOP_AUTH_HTML);
  assert.equal(response.headers.get("allow-csp-from"), "*");
  const script = DPOP_AUTH_HTML.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = createHash("sha256").update(script).digest("base64");
  assert.ok(
    response.headers.get("content-security-policy").includes(`sha256-${hash}`),
  );
  assert.equal(
    (await fetch(base + dpopAuthPathFor(issuer, "another-app"))).status,
    403,
  );
  assert.equal(
    (
      await fetch(
        base +
          dpopAuthPathFor("https://evil.example/realms/studio", "creatorroom"),
      )
    ).status,
    403,
  );
});
