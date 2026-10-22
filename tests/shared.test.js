import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import express from "express";
import { installBrokerProxy } from "../server/shared.js";

async function listen(t, handler) {
  const s = createServer(handler);
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  t.after(
    () =>
      new Promise((r) => {
        s.closeAllConnections();
        s.close(r);
      }),
  );
  return { server: s, base: `http://127.0.0.1:${s.address().port}` };
}
function raw(base, path) {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    const r = httpRequest(
      { hostname: u.hostname, port: u.port, path },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    r.on("error", reject);
    r.end();
  });
}
test("shared tunnel forwards member auth with fixed HTTPS origin and blocks admin, master and traversal", async (t) => {
  const seen = [];
  const target = await listen(t, (req, res) => {
    seen.push(req.url);
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        path: req.url,
        host: req.headers.host,
        proto: req.headers["x-forwarded-proto"],
        forwarded: req.headers.forwarded || null,
        proxyAuth: req.headers["proxy-authorization"] || null,
      }),
    );
  });
  const app = express();
  installBrokerProxy(app, {
    tideProxy: true,
    origin: "https://shared.example",
    tideUpstream: target.base,
    adapter: { realm: "studio" },
  });
  app.use((req, res) => res.sendStatus(404));
  const source = await listen(t, app);
  const r = await fetch(
    source.base + "/realms/studio/.well-known/openid-configuration",
    {
      headers: {
        "x-forwarded-host": "evil.example",
        forwarded: "host=evil.example;proto=http",
        "proxy-authorization": "Bearer test-only",
      },
    },
  );
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {
    path: "/realms/studio/.well-known/openid-configuration",
    host: "shared.example",
    proto: "https",
    forwarded: null,
    proxyAuth: null,
  });
  for (const path of [
    "/admin/realms/studio/roles",
    "/admin/realms/studio/iga/change-requests",
    "/realms/master/protocol/openid-connect/token",
  ]) {
    assert.equal((await fetch(source.base + path)).status, 404);
  }
  assert.equal(
    await raw(
      source.base,
      "/realms/studio/%2e%2e/%2e%2e/admin/realms/studio/roles",
    ),
    400,
  );
  assert.equal(
    await raw(
      source.base,
      "http://evil.example/realms/studio/.well-known/openid-configuration",
    ),
    400,
  );
  assert.equal(
    (await fetch(source.base + "/realms/studio/account/", { method: "DELETE" }))
      .status,
    405,
  );
  assert.equal(
    seen.length,
    1,
    "blocked requests never reach the identity broker",
  );
});
