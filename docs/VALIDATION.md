# Validation — 22 October 2026

## Verified locally

Environment used: Windows, Node.js 24.19.0, npm 12.0.2, Chromium via Playwright. The production client bundle builds successfully. Dependency versions are pinned in `package-lock.json`.

`npm test` passes 16 API/security tests:

1. Per-asset invitations, permitted and refused reads, encrypted feedback, operator storage inspection, and immediate API denial after invitation removal using the same session.
2. Rejection of identity headers, role escalation, reviewer grants and operator self-invitation.
3. Rejection of cross-origin writes, non-JSON writes, plaintext fields, unexpected key fields, wrong envelope modes, oversized files and active SVG uploads.
4. Setup mode fails closed; demo login is unavailable without explicit demo mode; public config omits secrets.
5. Actual ES256 JWT verification through the installed Tide verification SDK: signature, issuer, client, expiry, member mapping, operator separation, bound-token Bearer rejection, and the realm-management admin role. JWTs are signed with ephemeral test keys, not a real Tide realm.
6. The real Tide SDK policy parser checks asset, recipient, model, signature presence and expiry. Its fixture signature is deliberately fake: this is **not** a VVK signature verification test.
7. Concurrent store mutations are serialised, and a failed mutation does not commit partial state.
8. Strict DPoP verifies an actual EdDSA-signed token and an ES256 browser proof: key binding, token hash, method, URL, iat, replay, missing proof, unbound token downgrade, and untrusted forwarded headers.
9. The relay serves the SDK HTML byte-for-byte with a valid script hash in CSP and `Allow-CSP-From`; a different issuer/client is refused.

Five collaboration tests cover display-name persistence without privilege escalation, owner edits and member project creation, blocked upload before group approval, approver not becoming a reader, atomic one-use invitation claims, owner confirmation, per-draft access, expired/cancelled invitations and v1 data migration. A sixth covers rejection of a multi-draft invitation preventing a late partial grant. The upload test also rejects a policy exceeding the requested one-hour duration. Collaboration HTTP tests inject authentication; separate JWT/DPoP tests verify actual cryptographic proofs.

One additional HTTP test runs a real local upstream to verify the optional tunnel proxy: fixed HTTPS forwarding headers, allowed member routes, blocked admin/master/traversal/absolute-form requests and unsupported verbs never reaching the upstream.

`npm run test:e2e`: **3 passed** in Chromium. The first covers sample upload/invite/review/deny/inspect, encrypted feedback and API denial after removal. The second creates a project and uploads/decrypts a custom TXT, inspecting the request for raw/base64 plaintext leaks. The third saves a profile, creates/opens/edits a project, refreshes its deep link, uploads, creates a one-use link, switches to a member who also owns a project, accepts, confirms as owner, approves as admin and opens the draft as reviewer. Mobile layout has no horizontal overflow. All three use actual WebCrypto in demo mode, with one browser's shared IndexedDB; this is not cross-user Tide cryptographic isolation.

A browser rerun exposed a transient Windows `EPERM` during atomic JSON replacement. The store now retries sharing/access errors with bounded delays (up to 465 ms total), preserves atomic replacement and never removes the target as a fallback. Disk persistence is checked with 25 concurrent mutations in the migration test.

PowerShell parsed `scripts/start-share.ps1` successfully. An explicit `.invalid` HTTPS origin triggered the DNS guard before app/Docker mutations; hashes of the active `.env` and adapter were unchanged. No tunnel was started for this guard check.

## Local Tide setup verified

On the administrator's machine: Docker TideCloak is running on loopback port 8080; realm/client `creatorroom` exists, licensed public adapter contains an EdDSA key and signed app origin, the admin has linked `tideUserKey`/`vuid`, required app/crypto roles are assigned, and `tide-realm-admin` was granted last with an admin policy present and zero pending change requests at that earlier checkpoint. Login branding was uploaded and re-signed, and the first-login profile wall was disabled. Tide Doctor first returned RESULT: OK (16 checks) against the running app and realm. After proposing signup, it returns RESULT: OK with 15 passes, one warning for the pending registration request and no failures. Chromium reached the real-mode login page with its login button enabled and no visible error; clicking reached the Tide sign-in page at ork1.tideprotocol.com. No credentials were entered by automation. The final check used the visible Sign in heading; Tide renders its submit control as a custom element, not a native button. These infrastructure checks do **not** prove real encryption/decryption.

### New-member signup follow-up

A fresh login page did not expose account creation. Realm inspection found `registrationAllowed=false` and `link-tide-account-action` enabled but not default. The default link action was enabled for new accounts. A narrowly scoped `SET_REALM_CONFIG` request to set registrationAllowed=true remains **PENDING human approval** in the app governance panel. The realm API also generated unrelated attribute-default changes; that one pending attribute request was denied without applying it. No unrelated governance request was approved.

The app now exposes an explicit Create account action using the installed SDK's registration method. Until the group admin signs the registration request, new-account registration is not ready. Existing-user local sign-in continues to reach Tide. User chose to perform human acceptance later; account creation/link/return-to-invite has not been completed by automation.

## Not verified yet

- New member realm signup, required Tide linking and return to the original invitation, after the admin enables registration.
- Acceptance of the updated app-profile and collaboration flows by the real user (who chose to test later). Display-name persistence is tested through the app API and browser demo; it no longer uses Account API.
- `RelationshipAttestation:1` and policy-expiry support on the chosen ORK network.
- The group approver's real enclave approvals, IGA crypto-role grants and VVK policy signature for an ordinary member.
- Shared Tide encryption/decryption between two actual user sessions and network refusal for the wrong person, record, tag or operation.
- Operator decryption refusal by the actual network.
- Live policy expiry and role/credential-refresh latency.
- A working external HTTPS URL, shared-origin setup and two-device sign-in. Current-network Cloudflare edge/DNS and SSH tunnel attempts failed. User explicitly deferred networking until changing networks; local config was restored.
- Production hosting, load/concurrency, recovery or hostile-client hardening.

## Trust boundaries and limits

- In Tide mode the browser encrypts file bytes and feedback before the app receives them. The server stores ciphertext, policies and visible metadata; it has no encryption/decryption key endpoint.
- The server verifies JWTs and checks API invitations. It parses policy scope and checks signature presence; the ORK network must verify the actual VVK signature.
- Ordinary project owners are members. A separate group approver signs policy requests using their own browser credentials, and does not automatically receive a content grant. A distinct operator account has no signer authority. Preventing a Tide admin from self-granting requires a correctly configured quorum and a separate acceptance test; no such claim is made here.
- Cryptographic policy access is read/write for a record so a reviewer can encrypt feedback; server-side rules reserve original-asset writes for the owner. This is not a cryptographic guarantee that a permitted reviewer can never construct new ciphertext for that record.
- Removing an invitation stops subsequent API requests, not use of a copied still-valid Tide policy. Expiry bounds the policy; it cannot erase previously decrypted material.
- Demo mode is a local development harness. All personas share the browser key store. It must not be used as evidence that Tide protection has been demonstrated.
- Metadata is not encrypted. Tide-mode members list only owned projects and actively granted drafts; demo mode exposes sample project metadata to support denied-access demonstrations. Known participant identities and audit/activity metadata remain visible to signed-in workspace users. The operator can inspect storage metadata.
- Audit logs are not tamper-proof. A malicious application server or client can alter metadata or deliver hostile client code; this prototype does not establish protection against every active compromise.
- Tide mode requires DPoP and embedded public EdDSA keys. Proof replay storage is in memory for one process; multiple instances need a shared store. Only the explicitly configured `APP_ORIGIN` and `APP_ADDITIONAL_ORIGINS` may supply the DPoP URL origin; forwarded headers are not trusted.
- Optional public sharing proxies only member realm/resources, blocking all admin/master endpoints. Group approvals must be performed from localhost on the host; remote admin workflow is not exposed. Its browser-side shared setup still needs live acceptance.
- JSON storage is for a single process; no multi-instance coordination, backup or availability guarantees.

## Live acceptance record

Record the realm/network build, date, operator, success/failure, and evidence without tokens, keys or private content.

| Check | Result | Evidence |
|---|---|---|
| Group approver signs policy, ordinary owner encrypts draft | Pending | User will test enclave later |
| Invited reviewer decrypts same draft in another browser | Pending | |
| Reviewer feedback decrypts for creator | Pending | |
| Wrong user and wrong record refused by network | Pending | |
| Operator cannot decrypt, even given ciphertext | Pending | |
| Policy expiry enforced by network | Pending | |
