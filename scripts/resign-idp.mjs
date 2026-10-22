// Operational CLI only. Never import this file into the app runtime.
// Signs existing IdP settings after changing the broker hostname; no realm creation.
import fs from "node:fs";
const values = Object.fromEntries(
  fs
    .readFileSync(".env.tide.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^\s*\w+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^(['"])(.*)\1$/, "$2"),
      ];
    }),
);
if (!values.TIDE_ADMIN_PASSWORD)
  throw new Error("Set TIDE_ADMIN_PASSWORD in ignored .env.tide.local.");
const base = "http://localhost:8080";
const tr = await fetch(base + "/realms/master/protocol/openid-connect/token", {
  method: "POST",
  body: new URLSearchParams({
    client_id: "admin-cli",
    grant_type: "password",
    username: values.TIDE_ADMIN_USERNAME || "admin",
    password: values.TIDE_ADMIN_PASSWORD,
  }),
});
if (!tr.ok) throw new Error("Local admin authentication returned " + tr.status);
const token = (await tr.json()).access_token;
const r = await fetch(
  base + "/admin/realms/creatorroom/vendorResources/sign-idp-settings",
  {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(45000),
  },
);
if (!r.ok)
  throw new Error("Signing existing IdP settings returned " + r.status);
console.log("Existing Tide IdP settings re-signed; no credential printed.");
