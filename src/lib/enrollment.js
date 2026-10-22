import { adminRequest, approveGovernance } from "./tide-admin.js";

// Supported IGA adoption + Tide account-link flow. The admin browser proposes
// and approves with its own DPoP-bound session; no master credentials or roles
// are granted to the new member. Link tokens stay in component memory only.
export async function prepareMemberEnrollment(
  config,
  personId,
  { request = adminRequest, approve = approveGovernance } = {},
) {
  if (config.mode !== "tide")
    throw new Error("Member linking requires Tide mode.");
  const person = encodeURIComponent(personId);
  const user = await request(config, `/users/${person}`);
  if (user.attributes?.tideUserKey?.[0] || user.attributes?.tideuserkey?.[0])
    throw new Error("This member is already linked. Use Sign in.");
  const pendingPath = "/iga/change-requests?status=PENDING";
  async function propose(
    path,
    method,
    body,
    expectedAction,
    validRows = () => true,
  ) {
    const before = await request(config, pendingPath);
    if (before.some((r) => r.entityId === personId))
      throw new Error(
        "This member has a pending change. Review it in Tide governance, then prepare the link again.",
      );
    const beforeIds = new Set(before.map((r) => r.id));
    await request(config, path, method, body);
    const after = await request(config, pendingPath);
    const created = after.filter((r) => !beforeIds.has(r.id));
    // Never approve pre-existing requests or unexpected fields/actions.
    for (const row of created) {
      if (
        row.entityId !== personId ||
        row.actionType !== expectedAction ||
        !validRows(row.rows || [])
      )
        throw new Error(
          "Unexpected governance change; review it manually in Tide governance. No automatic approval was sent.",
        );
    }
    for (const row of created) await approve(config, row.id);
  }
  let state = await request(
    config,
    `/tideAdminResources/users/${person}/committed`,
  );
  if (!state.committed) {
    await propose(
      "/iga/adopt",
      "POST",
      { entityType: "USER", entityId: personId },
      "ADOPT_USER",
    );
    state = await request(
      config,
      `/tideAdminResources/users/${person}/committed`,
    );
    if (!state.committed)
      throw new Error(
        "Member adoption is waiting for quorum. Finish it in Tide governance, then retry.",
      );
  }
  if (!state.tideInvitable) {
    const current = await request(config, `/users/${person}`);
    await propose(
      `/users/${person}`,
      "PUT",
      {
        attributes: { ...current.attributes, tideInvitable: ["true"] },
      },
      "SET_USER_ATTRIBUTE",
      (rows) =>
        rows.length > 0 &&
        rows.every(
          (r) =>
            r.NAME === "tideInvitable" &&
            ["true", '["true"]'].includes(String(r.VALUE)),
        ),
    );
    state = await request(
      config,
      `/tideAdminResources/users/${person}/committed`,
    );
    if (!state.committed || !state.tideInvitable)
      throw new Error(
        "Member enrollment permission is waiting for quorum. Finish it in Tide governance, then retry.",
      );
  }
  const params = new URLSearchParams({
    userId: personId,
    client_id: config.adapter.resource,
    redirect_uri: `${window.location.origin}/`,
    lifespan: "1800",
  });
  const value = await request(
    config,
    `/tideAdminResources/get-required-action-link?${params}`,
    "POST",
    ["link-tide-account-action"],
  );
  const base = new URL(
    config.adminBaseUrl || config.adapter["auth-server-url"],
  );
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Tide did not return an enrollment URL.");
  }
  if (
    url.origin !== base.origin ||
    url.pathname !==
      `/realms/${encodeURIComponent(config.adapter.realm)}/login-actions/action-token` ||
    !url.searchParams.get("key")
  )
    throw new Error(
      "Tide returned an unexpected enrollment URL; it was not displayed.",
    );
  return url.href;
}
