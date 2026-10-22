import {
  adminRequest,
  approveGovernance,
  governedChange,
} from "./tide-admin.js";

const isInvitableRow = (r) =>
  r.NAME === "tideInvitable" && ["true", '["true"]'].includes(String(r.VALUE));
// The only governed changes that belong to enrolling a member. CREATE_USER is
// filed when someone registered while self-registration was still off; it must
// be approved (not replaced by ADOPT_USER) so the account becomes committed.
function enrollmentRow(row) {
  if (["CREATE_USER", "ADOPT_USER"].includes(row.actionType)) return true;
  return (
    row.actionType === "SET_USER_ATTRIBUTE" &&
    (row.rows || []).length > 0 &&
    row.rows.every(isInvitableRow)
  );
}
const enrollmentRank = (row) => (row.actionType === "SET_USER_ATTRIBUTE" ? 1 : 0);

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
  const deps = { request, approve, rank: enrollmentRank };
  const committedPath = `/tideAdminResources/users/${person}/committed`;
  let state = await request(config, committedPath);
  if (!state.committed) {
    await governedChange(
      config,
      personId,
      () =>
        request(config, "/iga/adopt", "POST", {
          entityType: "USER",
          entityId: personId,
        }),
      enrollmentRow,
      {
        ...deps,
        noChange:
          "Tide did not file an adoption request for this member. Refresh and retry.",
      },
    );
    state = await request(config, committedPath);
    if (!state.committed)
      throw new Error(
        "Member adoption is waiting for quorum. Finish it in Tide governance, then retry.",
      );
  }
  if (!state.tideInvitable) {
    const current = await request(config, `/users/${person}`);
    // Keycloak runs a full profile update on PUT: omitted names are cleared and
    // omitted attributes become REMOVE_USER_ATTRIBUTE requests, so send the
    // current representation and change only tideInvitable.
    const body = {
      username: current.username,
      email: current.email,
      firstName: current.firstName,
      lastName: current.lastName,
      attributes: { ...current.attributes, tideInvitable: ["true"] },
    };
    await governedChange(
      config,
      personId,
      () => request(config, `/users/${person}`, "PUT", body),
      enrollmentRow,
      {
        ...deps,
        noChange:
          "Tide did not record tideInvitable. In TideCloak enable Realm settings → User profile → Unmanaged attributes (or declare tideInvitable), then retry.",
      },
    );
    state = await request(config, committedPath);
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
