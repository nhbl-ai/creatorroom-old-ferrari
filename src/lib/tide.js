// Adapted from Tide's published RelationshipAttestation reference. Policy
// signing happens in the creator/admin browser, never in our application server.
// https://github.com/tide-foundation/raziel-mcp/blob/master/templates/relationship-attestation/relationship.ts
// Upstream copyright: Tide Foundation and contributors. Modified for CreatorRoom
// by Old Ferrari, 2026. Tide Community Open Code License; see THIRD_PARTY_NOTICES.md
// and licenses/Tide-Community-Open-Code.txt. Distributed WITHOUT WARRANTY.
import { tideService } from "./api.js";
import { adminRequest } from "./tide-admin.js";
import { fromBase64, toBase64 } from "./crypto.js";

export async function signInvitation({
  config,
  user,
  recipient,
  recordId,
  hours = 1,
}) {
  if (config.mode === "demo") return null;
  if (!user.canSign)
    throw new Error("A Tide approver must sign this request in Approvals.");
  if (!recipient.tideUserKey)
    throw new Error(
      "The recipient must sign in through Tide once and have the tideuserkey mapper enabled.",
    );
  const [{ Models }, { PolicySignRequest }] = await Promise.all([
    import("@tideorg/js"),
    import("heimdall-tide"),
  ]);
  const policy = new Models.Policy({
    version: Models.Policy.latestVersion,
    contractId: "RelationshipAttestation:1",
    modelId: ["PolicyEnabledEncryption:1", "PolicyEnabledDecryption:1"],
    keyId: config.adapter.vendorId,
    approvalType: Models.ApprovalType.IMPLICIT,
    executionType: Models.ExecutionType.PRIVATE,
    params: new Map([
      ["subjectType", "User"],
      ["subjectId", recipient.tideUserKey],
      ["assignmentId", recordId],
      // Reviewers encrypt feedback, but the API reserves original-asset writes
      // for the owner. This grants crypto read/write for this one record only.
      ["roles", JSON.stringify(["_tide_encryptor", "_tide_decryptor"])],
    ]),
    expiry:
      Math.floor(Date.now() / 1000) + Math.min(24, Math.max(1, hours)) * 3600,
  });
  const adminPolicy = await adminRequest(
    config,
    "/iga/role-policies/name/tide-realm-admin",
  );
  const policyBase64 = adminPolicy.policy;
  if (!policyBase64) throw new Error("The realm has no signed admin policy.");
  const request = PolicySignRequest.New(policy);
  request.setCustomExpiry(604800);
  // The upstream reference uses this internal client for policy signing; the
  // IAMService singleton does not expose public signing wrappers in this SDK.
  const client = tideService().getTideCloakClient();
  const initialised = await client.createTideRequest(request.encode());
  const id = Models.BaseTideRequest.decode(initialised).getUniqueId();
  const [approval] = await client.requestTideOperatorApproval([
    { id, request: initialised },
  ]);
  if (!approval || approval.status !== "approved")
    throw new Error(
      `The Tide invitation was not approved (${approval?.status || "no response"}).`,
    );
  const approved = Models.BaseTideRequest.decode(approval.request);
  approved.addPolicy(fromBase64(policyBase64));
  const signatures = await client.executeSignRequest(approved.encode(), true);
  if (!signatures?.[0]) throw new Error("Tide returned no policy signature.");
  policy.signature = signatures[0];
  return toBase64(policy.toBytes());
}
