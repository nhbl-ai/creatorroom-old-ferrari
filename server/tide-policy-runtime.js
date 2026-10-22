import { Models } from "@tideorg/js";

export { Models };

export function parsePolicy(policyBase64) {
  const policy = Models.Policy.from(
    new Uint8Array(Buffer.from(policyBase64, "base64")),
  );
  return {
    contractId: policy.contractId,
    keyId: String(policy.keyId),
    modelId: policy.modelIds,
    approvalType: policy.approvalType,
    executionType: policy.executionType,
    params: Object.fromEntries(policy.params.entries),
    expiry: Number(policy.expiry),
    hasSignature: Boolean(policy.signature?.length),
    expectedApprovalType: Models.ApprovalType.IMPLICIT,
    expectedExecutionType: Models.ExecutionType.PRIVATE,
  };
}
