import { requireThat } from "./errors.js";

export const MAX_POLICY_AGE = 24 * 60 * 60;
export const MAX_CIPHERTEXT_LENGTH = 3_000_000;

export function validateEnvelope(value, mode) {
  requireThat(
    value && typeof value === "object" && !Array.isArray(value),
    400,
    "An encrypted envelope is required.",
  );
  const expected = mode === "tide" ? "tide-policy-v1" : "local-demo-v1";
  const fields =
    mode === "tide"
      ? ["scheme", "ciphertext"]
      : ["scheme", "ciphertext", "iv", "keyId"];
  requireThat(
    Object.keys(value).every((key) => fields.includes(key)),
    400,
    "Only ciphertext fields are accepted.",
  );
  requireThat(
    value.scheme === expected,
    400,
    `This server accepts ${expected} envelopes only.`,
  );
  requireThat(
    typeof value.ciphertext === "string" &&
      value.ciphertext.length >= 16 &&
      value.ciphertext.length <= MAX_CIPHERTEXT_LENGTH &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(value.ciphertext),
    400,
    "Invalid or oversized ciphertext.",
  );
  if (mode === "demo") {
    requireThat(
      typeof value.iv === "string" && /^[A-Za-z0-9+/]{16}$/.test(value.iv),
      400,
      "Invalid AES-GCM nonce.",
    );
    requireThat(
      typeof value.keyId === "string" &&
        /^[a-zA-Z0-9-]{1,100}$/.test(value.keyId),
      400,
      "Invalid demo key reference.",
    );
  }
  return Object.fromEntries(fields.map((key) => [key, value[key]]));
}

// These checks validate the stored shape and scope. The Tide network, not the
// application, cryptographically verifies the policy signature on every operation.
export async function validatePolicy(
  policyBase64,
  { mode, assetId, person, vendorId },
) {
  if (mode === "demo") {
    requireThat(
      policyBase64 == null,
      400,
      "Demo mode does not accept Tide policies.",
    );
    return { policyBase64: null, expiresAt: null };
  }
  requireThat(
    typeof policyBase64 === "string" &&
      policyBase64.length <= 100_000 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(policyBase64),
    400,
    "A signed Tide relationship policy is required.",
  );
  try {
    const { parsePolicy } = await import("../.cache/tide-policy-runtime.mjs");
    const policy = parsePolicy(policyBase64);
    const get = (key) => String(policy.params[key] ?? "");
    const operations = JSON.parse(get("roles"));
    const expiry = Number(policy.expiry);
    const now = Math.floor(Date.now() / 1000);
    requireThat(
      policy.contractId === "RelationshipAttestation:1" &&
        String(policy.keyId) === vendorId,
      400,
      "Policy must use this realm and RelationshipAttestation:1.",
    );
    requireThat(
      policy.executionType === policy.expectedExecutionType &&
        policy.approvalType === policy.expectedApprovalType &&
        Array.isArray(policy.modelId) &&
        policy.modelId.length === 2 &&
        policy.modelId.includes("PolicyEnabledEncryption:1") &&
        policy.modelId.includes("PolicyEnabledDecryption:1"),
      400,
      "The relationship policy must use the supported encryption and decryption model.",
    );
    requireThat(
      get("subjectType") === "User" &&
        person.tideUserKey &&
        get("subjectId") === person.tideUserKey &&
        get("assignmentId") === assetId,
      400,
      "The policy does not match this person and asset.",
    );
    requireThat(
      Array.isArray(operations) &&
        operations.length === 2 &&
        operations.includes("_tide_encryptor") &&
        operations.includes("_tide_decryptor"),
      400,
      "Review access requires encrypted reading and feedback.",
    );
    requireThat(
      policy.hasSignature,
      400,
      "Unsigned policies cannot be stored.",
    );
    requireThat(
      expiry > now && expiry <= now + MAX_POLICY_AGE + 60,
      400,
      "Policy expiry must be within the next 24 hours.",
    );
    return { policyBase64, expiresAt: new Date(expiry * 1000).toISOString() };
  } catch (error) {
    if (error.status) throw error;
    requireThat(false, 400, "Cannot decode the signed Tide policy.");
  }
}
