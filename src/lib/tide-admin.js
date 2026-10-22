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
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      `Tide could not complete this operation (${response.status}). ${typeof value.error === "string" ? value.error.slice(0, 160) : "Check the pending governance requests."}`,
    );
    error.status = response.status;
    throw error;
  }
  if (response.status === 202 && value && !Array.isArray(value)) {
    const location = response.headers.get("Location");
    value.changeRequestId ||= location?.split("/").filter(Boolean).pop();
    value.pendingGovernance = true;
  }
  return value;
}
export async function approveGovernance(config, id) {
  let result = await adminRequest(
    config,
    `/iga/change-requests/${encodeURIComponent(id)}/approve`,
    "POST",
    {},
  );
  if (result.mode === "needs-approval") {
    const { Models } = await import("@tideorg/js");
    const request = fromBase64(result.requestModel);
    const uniqueId = Models.BaseTideRequest.decode(request).getUniqueId();
    const [approval] = await tideService()
      .getTideCloakClient()
      .requestTideOperatorApproval([{ id: uniqueId, request }]);
    if (approval?.status !== "approved")
      throw new Error("The governance request was not approved.");
    result = await adminRequest(
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
export async function ensureCryptoRoles(config, personId) {
  if (config.mode !== "tide") return;
  const roles = await adminRequest(config, "/roles");
  for (const name of ["_tide_enabled", "_tide_encryptor", "_tide_decryptor"]) {
    const owned = await adminRequest(
      config,
      `/users/${encodeURIComponent(personId)}/role-mappings/realm`,
    );
    if (owned.some((r) => r.name === name)) continue;
    const role = roles.find((r) => r.name === name);
    if (!role)
      throw new Error(
        `Realm is missing ${name}. Ask the realm administrator to configure it.`,
      );
    let created;
    try {
      created = await adminRequest(
        config,
        `/users/${encodeURIComponent(personId)}/role-mappings/realm`,
        "POST",
        [role],
      );
    } catch (error) {
      if (error.status === 409)
        throw new Error(
          "A role change is already pending for this user. Review it in Governance, then retry.",
        );
      throw error;
    }
    if (created.pendingGovernance) {
      const id = created.changeRequestId || created.id;
      if (!id)
        throw new Error(
          "Role change is pending. Review it in Governance, then retry.",
        );
      const row = await adminRequest(
        config,
        `/iga/change-requests/${encodeURIComponent(id)}`,
      );
      if (row.entityId !== personId || row.actionType !== "GRANT_ROLES")
        throw new Error("Unexpected governance request; review it manually.");
      await approveGovernance(config, id);
    }
    const after = await adminRequest(
      config,
      `/users/${encodeURIComponent(personId)}/role-mappings/realm`,
    );
    if (!after.some((r) => r.name === name))
      throw new Error(
        "Role approval is pending quorum. Complete it in Governance, then retry.",
      );
  }
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
