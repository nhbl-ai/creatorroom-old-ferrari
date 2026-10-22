# Validation — 22 October 2026

## Verified locally

Environment used: Windows, Node.js 24.19.0, npm 12.0.2, Chromium via Playwright. The production client bundle builds successfully. Dependency versions are pinned in `package-lock.json`.

`npm test` checks nine API/security scenarios:

1. Per-asset invitations, permitted and refused reads, encrypted feedback, operator storage inspection, and immediate API denial after invitation removal using the same session.
2. Rejection of identity headers, role escalation, reviewer grants and operator self-invitation.
3. Rejection of cross-origin writes, non-JSON writes, plaintext fields, unexpected key fields, wrong envelope modes, oversized files and active SVG uploads.
4. Setup mode fails closed; demo login is unavailable without explicit demo mode; public config omits secrets.
5. Actual ES256 JWT verification through the installed Tide verification SDK: signature, issuer, client, expiry, app role, bound-token Bearer rejection, and the realm-management admin role. JWTs are signed with ephemeral test keys, not a real Tide realm.
6. The real Tide SDK policy parser checks asset, recipient, model, signature presence and expiry. Its fixture signature is deliberately fake: this is **not** a VVK signature verification test.
7. Concurrent store mutations are serialised, and a failed mutation does not commit partial state.
8. Strict DPoP verifies an actual EdDSA-signed token and an ES256 browser proof: key binding, token hash, method, URL, iat, replay, missing proof, unbound token downgrade, and untrusted forwarded headers.
9. The relay serves the SDK HTML byte-for-byte with a valid script hash in CSP and `Allow-CSP-From`; a different issuer/client is refused.

Two browser tests cover the sample upload/invite/review/deny/inspect workflow with actual WebCrypto encryption, encrypted feedback round-trip between creator/reviewer demo personas, direct forbidden API calls, removal of an invitation, and a mobile layout without horizontal overflow. The second test creates a custom project through the UI, uploads a text file, verifies that neither its text nor its base64 content was sent in the upload request, and decrypts it in the review room. The demo uses one browser's IndexedDB; it is not cross-user cryptographic isolation.

## Local Tide setup verified

On the administrator's machine: Docker TideCloak is running on loopback port 8080; realm/client `creatorroom` exists, licensed public adapter contains an EdDSA key and signed app origin, the admin has linked `tideUserKey`/`vuid`, required app/crypto roles are assigned, and `tide-realm-admin` was granted last with an admin policy present and zero pending change requests. Login branding was uploaded and re-signed, and the first-login profile wall was disabled. Tide Doctor returned RESULT: OK (15 checks) against the running app and realm. Chromium reached the real-mode login page with its login button enabled and no visible error. These infrastructure checks do **not** prove real encryption/decryption.

## Not verified yet

- Real user login to CreatorRoom and Account API display-name save.
- `RelationshipAttestation:1` and policy-expiry support on the chosen ORK network.
- The creator/admin's real enclave approval and VVK policy signature.
- Shared Tide encryption/decryption between two actual user sessions and network refusal for the wrong person, record, tag or operation.
- Operator decryption refusal by the actual network.
- Live policy expiry and role/credential-refresh latency.
- Production hosting, reverse proxy/TLS, load/concurrency, recovery or hostile-client hardening.

## Trust boundaries and limits

- In Tide mode the browser encrypts file bytes and feedback before the app receives them. The server stores ciphertext, policies and visible metadata; it has no encryption/decryption key endpoint.
- The server verifies JWTs and checks API invitations. It parses policy scope and checks signature presence; the ORK network must verify the actual VVK signature.
- The creator also holds Tide admin authority in this MVP. A distinct operator account does not. Preventing a Tide admin from self-granting requires a correctly configured quorum and a separate acceptance test; no such claim is made here.
- Cryptographic policy access is read/write for a record so a reviewer can encrypt feedback; server-side rules reserve original-asset writes for the owner. This is not a cryptographic guarantee that a permitted reviewer can never construct new ciphertext for that record.
- Removing an invitation stops subsequent API requests, not use of a copied still-valid Tide policy. Expiry bounds the policy; it cannot erase previously decrypted material.
- Demo mode is a local development harness. All personas share the browser key store. It must not be used as evidence that Tide protection has been demonstrated.
- Project titles, descriptions, asset names/MIME/sizes, participant identity and audit metadata are visible as described in the UI. They are not encrypted by this prototype.
- Audit logs are not tamper-proof. A malicious application server or client can alter metadata or deliver hostile client code; this prototype does not establish protection against every active compromise.
- Tide mode requires DPoP and embedded public EdDSA keys. Proof replay storage is in memory for one process; multiple instances need a shared store. `APP_ORIGIN` is authoritative; forwarded headers are not trusted.
- JSON storage is for a single process; no multi-instance coordination, backup or availability guarantees.

## Live acceptance record

Record the realm/network build, date, operator, success/failure, and evidence without tokens, keys or private content.

| Check | Result | Evidence |
|---|---|---|
| Creator signs policy and encrypts draft | Pending | |
| Invited reviewer decrypts same draft in another browser | Pending | |
| Reviewer feedback decrypts for creator | Pending | |
| Wrong user and wrong record refused by network | Pending | |
| Operator cannot decrypt, even given ciphertext | Pending | |
| Policy expiry enforced by network | Pending | |
