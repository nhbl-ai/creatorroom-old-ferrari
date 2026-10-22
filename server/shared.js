import { request as httpRequest } from "node:http";
import { writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { requireThat, onlyFields } from "./errors.js";
import { publicAdapter } from "./config.js";

export function installSharedAdapter(app, { config }) {
  app.post("/api/tide/shared-adapter", async (req, res) => {
    requireThat(
      req.user.canSign && config.tideProxy,
      403,
      "Only an approver can finish shared access.",
    );
    requireThat(
      ["localhost:3000", "127.0.0.1:3000"].includes(req.get("host")),
      403,
      "Finish shared access from the host's local workspace.",
    );
    onlyFields(req.body, ["adapter"]);
    const adapter = req.body.adapter;
    requireThat(
      adapter && typeof adapter === "object" && !Array.isArray(adapter),
      400,
      "A public adapter is required.",
    );
    requireThat(
      adapter.realm === config.adapter.realm &&
        adapter.resource === config.adapter.resource &&
        adapter.vendorId === config.adapter.vendorId,
      400,
      "Adapter must belong to this realm and client.",
    );
    requireThat(
      adapter["auth-server-url"]?.replace(/\/+$/, "") === config.origin,
      400,
      "The shared adapter must use the configured public origin.",
    );
    requireThat(
      !adapter.credentials &&
        !adapter["client-secret"] &&
        adapter["public-client"] !== false &&
        adapter.jwk?.keys?.length &&
        adapter.jwk.keys.every((k) => !k.d && !k.k),
      400,
      "Only a public adapter with public JWKs is accepted.",
    );
    const fingerprints = (keys) =>
      keys
        .map((k) => [k.kty, k.crv, k.x, k.y].join(":"))
        .sort()
        .join("|");
    requireThat(
      fingerprints(adapter.jwk.keys) === fingerprints(config.adapter.jwk.keys),
      400,
      "Changing verification keys requires a separate deployment.",
    );
    requireThat(
      adapter[`client-origin-auth-${config.origin}`],
      409,
      "The public app origin is not signed yet. Complete the client change and re-sign settings.",
    );
    const updated = {
      ...publicAdapter(adapter),
      "public-client": true,
      tokenSignatureAlgorithms: ["EdDSA"],
    };
    const tmp = `${config.adapterPath}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(updated, null, 2) + "\n", {
      mode: 0o600,
    });
    await rename(tmp, config.adapterPath);
    config.adapter = updated;
    res.json({ ok: true, sharedOrigin: config.origin, sharedReady: true });
  });
}

// Public tunnel: member authentication and public assets only.
// No /admin, master realm, bootstrap, offboarding or governance API is proxied.
// Approvers operate from localhost and call the loopback broker directly.
export function installBrokerProxy(app, config) {
  if (!config.tideProxy) return;
  const target = new URL(config.tideUpstream),
    external = new URL(config.origin);
  if (
    target.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
  )
    throw new Error("The broker upstream must be HTTP loopback.");
  const realm = encodeURIComponent(config.adapter.realm);
  app.use((req, res, next) => {
    if (
      /^[a-z]+:\/\//i.test(req.originalUrl) ||
      /%2f|%5c|%2e/i.test(req.originalUrl.split("?")[0])
    )
      return res.sendStatus(400);
    const incoming = new URL(req.originalUrl, "http://request.invalid");
    const path = incoming.pathname;
    if (
      path.startsWith("/admin/") ||
      (path.startsWith("/realms/") && !path.startsWith(`/realms/${realm}/`))
    )
      return res.sendStatus(404);
    const permitted =
      path.startsWith(`/realms/${realm}/`) ||
      path.startsWith("/resources/") ||
      path.startsWith("/js/");
    if (!permitted) return next();
    if (!["GET", "POST", "HEAD", "OPTIONS"].includes(req.method))
      return res.sendStatus(405);
    const headers = {
      ...req.headers,
      host: external.host,
      "x-forwarded-host": external.host,
      "x-forwarded-proto": "https",
      "x-forwarded-port": external.port || "443",
    };
    for (const h of [
      "forwarded",
      "connection",
      "upgrade",
      "proxy-authorization",
      "proxy-connection",
    ])
      delete headers[h];
    headers["x-forwarded-for"] = req.socket.remoteAddress;
    const upstream = httpRequest(
      new URL(incoming.pathname + incoming.search, target),
      { method: req.method, headers },
      (response) => {
        res.status(response.statusCode || 502);
        for (const [name, value] of Object.entries(response.headers))
          if (
            value !== undefined &&
            !["connection", "transfer-encoding"].includes(name)
          )
            res.setHeader(name, value);
        response.pipe(res);
      },
    );
    upstream.setTimeout(60000, () => upstream.destroy());
    upstream.on("error", () => {
      if (!res.headersSent)
        res
          .status(502)
          .send(
            "The identity service is temporarily unavailable. Try again shortly.",
          );
      else res.destroy();
    });
    req.on("aborted", () => upstream.destroy());
    req.pipe(upstream);
  });
}
