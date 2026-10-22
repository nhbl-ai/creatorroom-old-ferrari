import { tideService, send } from "./api.js";
import { fromBase64, toBase64 } from "./crypto.js";

// Every request goes directly from the admin browser to Tide with its own proof.
// CreatorRoom never holds a master-admin password or signs on a human's behalf.
export async function adminRequest(config, path, method = "GET", body) {
  if (
    config.adminLocalOnly &&
    !["localhost", "127.0.0.1"].includes(window.location.hostname)
  )
    throw new Error(
      "Approvers: use http://localhost:3000 on the host machine. The public link does not expose Tide admin APIs.",
    );
  const base = (
    config.adminBaseUrl || config.adapter["auth-server-url"]
  ).replace(/\/+$/, "");
  const response = await tideService().secureFetch(
    `${base}/admin/realms/${encodeURIComponent(config.adapter.realm)}${path}`,
    {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    },
  );
  // The enrollment endpoint returns a text URL; governance returns JSON.
  const raw = await response.text();
  let value;
  try {
    value = raw ? JSON.parse(raw) : {};
  } catch {
    value = raw;
  }
  if (!response.ok) {
    // IGA errors carry a code in `error` (e.g. DEPENDENCY_NOT_MET) and Keycloak
    // ErrorResponse puts the text in `errorMessage`; show both when present.
    const detail = [value?.error, value?.errorMessage, value?.message]
      .filter((part) => typeof part === "string" && part)
      .join(": ")
      .slice(0, 200);
    const error = new Error(
      `Tide could not complete this operation (${response.status}). ${detail || "Check the pending governance requests."}`,
    );
    error.status = response.status;
    error.code = typeof value?.error === "string" ? value.error : "";
    throw error;
  }
  if (
    response.status === 202 &&
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const location = response.headers.get("Location");
    value.changeRequestId ||= location?.split("/").filter(Boolean).pop();
    value.pendingGovernance = true;
  }
  return value;
}
// ADOPT_* requests cannot go through /approve on a multiAdmin realm: its phase-1
// enclave model replays the change and the replay dispatcher has no ADOPT case
// ("Unknown IGA action: ADOPT_USER"). TideCloak exempts ADOPT_* (threshold 1,
// no producer quorum) from the enclave rule on the authorize + commit lane, and
// commit applies it via the ADOPT replay extension, re-enabling the account.
async function approveAdoption(config, id, request) {
  const path = `/iga/change-requests/${encodeURIComponent(id)}`;
  try {
    await request(config, `${path}/authorize`, "POST", {});
  } catch (error) {
    // Resuming an adoption this admin already authorized: just commit it.
    if (error.status !== 409 || !/already signed/i.test(error.message))
      throw error;
  }
  const result = await request(config, `${path}/commit`, "POST");
  return { ...result, mode: "recorded", committed: result.committed !== false };
}
export async function approveGovernance(
  config,
  id,
  actionType = "",
  { request = adminRequest } = {},
) {
  if (actionType.startsWith("ADOPT_"))
    return approveAdoption(config, id, request);
  let result = await request(
    config,
    `/iga/change-requests/${encodeURIComponent(id)}/approve`,
    "POST",
    {},
  );
  if (result.mode === "needs-approval") {
    const { Models } = await import("@tideorg/js");
    const model = fromBase64(result.requestModel);
    const uniqueId = Models.BaseTideRequest.decode(model).getUniqueId();
    const [approval] = await tideService()
      .getTideCloakClient()
      .requestTideOperatorApproval([{ id: uniqueId, request: model }]);
    if (approval?.status !== "approved")
      throw new Error("The governance request was not approved.");
    result = await request(
      config,
      `/iga/change-requests/${encodeURIComponent(id)}/approve`,
      "POST",
      { requestModel: toBase64(approval.request) },
    );
  }
  if (result.mode !== "recorded")
    throw new Error("Tide returned an unexpected approval state.");
  return result;
}

const PENDING_PATH = "/iga/change-requests?status=PENDING";

// Propose one governed change for `entityId` and approve only the matching
// requests with the admin's own session. TideCloak files most user changes
// inline and answers 204 (no Location), so requests are found by diffing the
// PENDING list. Requests already filed for this same change are resumed rather
// than blocking the member forever; anything else on the entity is refused.
// Rows for other entities (other admins, ADMIN_POLICY side effects) are left
// untouched.
export async function governedChange(
  config,
  entityId,
  perform,
  isExpected,
  {
    request = adminRequest,
    approve = approveGovernance,
    noChange = "Tide recorded no change request. Check the realm configuration, then retry.",
    rank = () => 0,
  } = {},
) {
  const before = await request(config, PENDING_PATH);
  const mine = before.filter((r) => r.entityId === entityId);
  if (mine.some((r) => !isExpected(r)))
    throw new Error(
      "This member has another pending change. Review it in Tide governance, then retry.",
    );
  let targets = mine;
  if (!targets.length) {
    const beforeIds = new Set(before.map((r) => r.id));
    await perform();
    const created = (await request(config, PENDING_PATH)).filter(
      (r) => !beforeIds.has(r.id) && r.entityId === entityId,
    );
    if (created.some((r) => !isExpected(r)))
      throw new Error(
        "Unexpected governance change; review it manually in Tide governance. No automatic approval was sent.",
      );
    if (!created.length) throw new Error(noChange);
    targets = created;
  }
  for (const row of [...targets].sort((a, b) => rank(a) - rank(b))) {
    const result = await approve(config, row.id, row.actionType);
    if (result?.committed === false)
      throw new Error(
        `Your approval for ${row.actionType} was recorded (${result.authCount ?? "?"}/${result.threshold ?? "?"}). Waiting for other approvers in Tide governance, then retry.`,
      );
  }
}

const CRYPTO_ROLES = ["_tide_enabled", "_tide_encryptor", "_tide_decryptor"];
export async function ensureCryptoRoles(config, personId, deps = {}) {
  if (config.mode !== "tide") return;
  const request = deps.request || adminRequest;
  const person = encodeURIComponent(personId);
  // Granting roles to an unattested self-registered user can lock them out.
  const state = await request(
    config,
    `/tideAdminResources/users/${person}/committed`,
  );
  if (!state.committed)
    throw new Error(
      "This member's account is not linked to Tide yet. Use Member account linking first, then retry.",
    );
  const roles = await request(config, "/roles");
  const wanted = CRYPTO_ROLES.map((name) => {
    const role = roles.find((r) => r.name === name);
    if (!role)
      throw new Error(
        `Realm is missing ${name}. Ask the realm administrator to configure it.`,
      );
    return role;
  });
  const wantedIds = new Set(wanted.map((r) => r.id));
  // One role per request: a second grant while one is pending returns 409.
  for (let step = 0; step <= wanted.length; step++) {
    const owned = await request(config, `/users/${person}/role-mappings/realm`);
    const missing = wanted.filter((r) => !owned.some((o) => o.name === r.name));
    if (!missing.length) return;
    if (step === wanted.length) break;
    await governedChange(
      config,
      personId,
      () =>
        request(config, `/users/${person}/role-mappings/realm`, "POST", [
          missing[0],
        ]),
      (row) =>
        row.actionType === "GRANT_ROLES" &&
        (row.rows || []).length > 0 &&
        row.rows.every((r) => wantedIds.has(r.ROLE_ID)),
      {
        ...deps,
        noChange: `Tide did not record a grant for ${missing[0].name}. Review the member in Tide governance, then retry.`,
      },
    );
  }
  throw new Error(
    "Role approval is pending quorum. Complete it in Tide governance, then retry.",
  );
}

export async function configureSharedAccess(config) {
  if (!config.sharedOrigin || !config.adminLocalOnly)
    throw new Error("Start shared mode on the host first.");
  const origin = config.sharedOrigin;
  const [client] = await adminRequest(
    config,
    `/clients?clientId=${encodeURIComponent(config.adapter.resource)}`,
  );
  if (!client?.id) throw new Error("Public client not found.");
  const wanted = [
    `${origin}/`,
    `${origin}/*`,
    `${origin}/silent-check-sso.html`,
    `${origin}/auth/redirect`,
  ];
  if (
    !wanted.every((uri) => client.redirectUris.includes(uri)) ||
    !client.webOrigins.includes(origin)
  ) {
    const proposed = await adminRequest(
      config,
      `/clients/${client.id}`,
      "PUT",
      {
        ...client,
        redirectUris: [...new Set([...client.redirectUris, ...wanted])],
        webOrigins: [...new Set([...client.webOrigins, origin])],
      },
    );
    if (proposed.pendingGovernance) {
      const id = proposed.changeRequestId || proposed.id;
      if (!id)
        throw new Error(
          "Public origin change is pending. Review it in Governance, then retry.",
        );
      const row = await adminRequest(
        config,
        `/iga/change-requests/${encodeURIComponent(id)}`,
      );
      if (row.entityId !== client.id || !row.actionType.startsWith("UPDATE_"))
        throw new Error("Unexpected client request; review it manually.");
      await approveGovernance(config, id);
    }
  }
  const applied = await adminRequest(config, `/clients/${client.id}`);
  if (
    !applied.webOrigins.includes(origin) ||
    !wanted.every((uri) => applied.redirectUris.includes(uri))
  )
    throw new Error(
      "Client change is still pending. Review the client requests in Governance, then retry.",
    );
  await adminRequest(config, "/vendorResources/sign-idp-settings", "POST");
  const branding = await adminRequest(config, "/vendorResources/get-branding");
  if (branding.logoUrl && branding.backgroundUrl) {
    const rebase = (value) => {
      const old = new URL(value);
      return origin + old.pathname + old.search;
    };
    await adminRequest(config, "/vendorResources/set-branding", "POST", {
      logoUrl: rebase(branding.logoUrl),
      backgroundUrl: rebase(branding.backgroundUrl),
    });
  }
  let adapter = await adminRequest(
    config,
    `/vendorResources/get-installations-provider?clientId=${encodeURIComponent(client.id)}&providerId=keycloak-oidc-keycloak-json`,
  );
  adapter = { ...adapter, "auth-server-url": origin };
  if (!adapter[`client-origin-auth-${origin}`])
    throw new Error(
      "The public origin is not signed yet. Retry after governance approval.",
    );
  await send("/tide/shared-adapter", { adapter });
}
