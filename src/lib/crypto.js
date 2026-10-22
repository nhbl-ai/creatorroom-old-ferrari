import { tideService } from "./api.js";

export function toBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export function fromBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function demoKey(keyId, create = false) {
  // Explicitly a same-browser development harness. All simulated identities
  // share this IndexedDB. This is NOT an access-control boundary or Tide E2EE.
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open("creatorroom-local-demo", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("keys");
    request.onerror = () =>
      reject(new Error("Enable browser storage to use the local demo."));
    request.onsuccess = () => resolve(request.result);
  });
  try {
    const existing = await new Promise((resolve, reject) => {
      const transaction = database.transaction("keys");
      const request = transaction.objectStore("keys").get(keyId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (existing) return existing;
    if (!create)
      throw new Error(
        "This demo draft was created in another browser or its local key was cleared. Use the original browser or upload a new draft.",
      );
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("keys", "readwrite");
      transaction.objectStore("keys").put(key, keyId);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    return key;
  } finally {
    database.close();
  }
}

export async function encryptPayload(
  payload,
  { mode, recordId, policyBase64, createKey = false },
) {
  const serialised = JSON.stringify({ ...payload, v: 1, recordId });
  if (mode === "tide") {
    if (!policyBase64)
      throw new Error(
        "A signed sharing policy is required. Self-encryption cannot be used for shared drafts.",
      );
    const [output] = await tideService().doEncrypt(
      [{ data: serialised, tags: [recordId] }],
      fromBase64(policyBase64),
    );
    if (
      !output ||
      (typeof output !== "string" && !(output instanceof Uint8Array))
    )
      throw new Error("Tide returned no encrypted content.");
    return {
      scheme: "tide-policy-v1",
      ciphertext: typeof output === "string" ? output : toBase64(output),
    };
  }
  if (mode !== "demo")
    throw new Error("Configure TideCloak before encrypting.");
  const key = await demoKey(recordId, createKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(recordId) },
    key,
    new TextEncoder().encode(serialised),
  );
  return {
    scheme: "local-demo-v1",
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
    keyId: recordId,
  };
}

export async function decryptPayload(
  envelope,
  { mode, recordId, policyBase64 },
) {
  let plaintext;
  if (mode === "tide") {
    if (envelope.scheme !== "tide-policy-v1" || !policyBase64)
      throw new Error("This draft needs a signed Tide sharing policy.");
    const [output] = await tideService().doDecrypt(
      [{ encrypted: envelope.ciphertext, tags: [recordId] }],
      fromBase64(policyBase64),
    );
    plaintext =
      typeof output === "string" ? output : new TextDecoder().decode(output);
  } else if (mode === "demo") {
    if (envelope.scheme !== "local-demo-v1" || envelope.keyId !== recordId)
      throw new Error("The encrypted envelope does not match this demo draft.");
    const key = await demoKey(recordId);
    const bytes = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(envelope.iv),
        additionalData: new TextEncoder().encode(recordId),
      },
      key,
      fromBase64(envelope.ciphertext),
    );
    plaintext = new TextDecoder().decode(bytes);
  } else throw new Error("TideCloak is not configured.");
  const payload = JSON.parse(plaintext);
  if (payload.v !== 1 || payload.recordId !== recordId)
    throw new Error("The decrypted content belongs to a different draft.");
  return payload;
}
