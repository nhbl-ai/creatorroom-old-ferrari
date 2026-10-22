import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const APP_ROLES = {
  creator: "creatorroom_creator",
  reviewer: "creatorroom_reviewer",
  operator: "creatorroom_operator",
};

export function publicAdapter(config) {
  // An allowlist prevents accidental client-secret or service-credential exposure.
  const allowed = [
    "auth-server-url",
    "realm",
    "resource",
    "vendorId",
    "jwk",
    "homeOrkUrl",
    "client-origin-auth",
    "ssl-required",
  ];
  return Object.fromEntries(
    Object.entries(config).filter(
      ([key]) => allowed.includes(key) || key.startsWith("client-origin-auth-"),
    ),
  );
}

export async function loadConfig() {
  const demo = process.argv.includes("--demo");
  const production = process.argv.includes("--production");
  if (demo && production)
    throw new Error("Demo identities must not run in production mode.");
  const port = Number(process.env.PORT || 3000);
  const origin = new URL(process.env.APP_ORIGIN || `http://localhost:${port}`)
    .origin;
  const origins = [
    ...new Set([
      origin,
      ...(process.env.APP_ADDITIONAL_ORIGINS || "")
        .split(",")
        .filter(Boolean)
        .map((value) => new URL(value.trim()).origin),
    ]),
  ];
  const tideProxy = process.env.TIDECLOAK_PROXY === "true";
  if (tideProxy && (demo || !origin.startsWith("https://")))
    throw new Error(
      "Shared access requires real Tide mode and an HTTPS app origin.",
    );
  const adapterPath = resolve(
    process.env.TIDECLOAK_CONFIG_PATH || "./data/tidecloak.json",
  );
  let adapter = null;
  if (!demo) {
    try {
      adapter = JSON.parse(await readFile(adapterPath, "utf8"));
      for (const field of [
        "auth-server-url",
        "realm",
        "resource",
        "vendorId",
      ]) {
        if (typeof adapter[field] !== "string" || !adapter[field])
          throw new Error(`Tide adapter is missing ${field}.`);
      }
      if (
        adapter.credentials ||
        adapter["client-secret"] ||
        adapter["public-client"] === false
      ) {
        throw new Error(
          "Export a PUBLIC Tide client adapter without credentials.",
        );
      }
      if (
        !Array.isArray(adapter.jwk?.keys) ||
        !adapter.jwk.keys.length ||
        adapter.jwk.keys.some((key) => key.d || key.k)
      )
        throw new Error("Export the Tide adapter with embedded PUBLIC JWKs.");
      if (tideProxy) adapter["auth-server-url"] = origin;
      adapter.tokenSignatureAlgorithms = ["EdDSA"];
      adapter["auth-server-url"] = adapter["auth-server-url"].replace(
        /\/+$/,
        "",
      );
      const authUrl = new URL(adapter["auth-server-url"]);
      if (!["http:", "https:"].includes(authUrl.protocol))
        throw new Error("Invalid Tide server URL.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (production && !adapter)
    throw new Error(
      "Production requires a configured TideCloak public client.",
    );
  return {
    mode: demo ? "demo" : adapter ? "tide" : "setup",
    production,
    requireDPoP: true,
    port,
    origin,
    adapter,
    adapterPath,
    origins,
    tideProxy,
    tideUpstream: process.env.TIDECLOAK_UPSTREAM || "http://127.0.0.1:8080",
    host: demo ? "127.0.0.1" : process.env.HOST || "127.0.0.1",
    dataPath: resolve(
      demo
        ? process.env.CREATORROOM_DEMO_DATA_PATH ||
            "./data/creatorroom-demo.json"
        : process.env.CREATORROOM_DATA_PATH || "./data/creatorroom-tide.json",
    ),
  };
}
