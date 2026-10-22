# Project overview

**CreatorRoom** lets creative teams share unreleased drafts and encrypted feedback with selected reviewers, without giving the application server a decryption key.

**Vision & originality.** One person can own a design project and review another. A single-use invitation opens only selected drafts; later uploads remain private. Decorative covers keep the workspace visual without publishing protected originals.

**Trust constraint.** Conventional collaboration platforms can read unreleased work. CreatorRoom separates coordination from browser encryption and recipient-specific Tide policies. Project owners confirm who claimed an invitation before an approver signs access.

**Value & impact.** A student designer can invite an external reviewer to one poster, collect feedback, and keep other drafts out of scope. Members use a browser; only the host operates Docker and TideCloak.

**Why TideCloak matters.** The real adapter uses SDK authentication, server-verified JWTs, strict DPoP and signed `RelationshipAttestation:1` policies bound to a recipient's Tide key and a draft ID. A group administrator approves policy requests using their own browser session; ordinary project owners are not realm administrators.

**Prototype & storytelling.** Local automated tests cover project creation, profiles, upload, one-use invitations, owner confirmation, approvals, encrypted review, forbidden reads and operator ciphertext inspection. Demo identities and shared browser keys are simulated. The local Tide realm and login entry are available; new-member registration enablement, real enclave signing and encryption between separate Tide users remain pending human acceptance. Multi-device HTTPS is deferred until the host changes networks.

## Run the local demo

Requires **Node.js 22.12+**. No Docker or Tide account is needed for this development mode.

```bash
git clone https://github.com/nhbl-ai/creatorroom-old-ferrari.git
cd creatorroom-old-ferrari
npm ci
npm run demo
```

Open **http://localhost:3000** in one browser/profile:

1. Enter as **Alex Morgan · member** and click **Load sample workspace**.
2. Open **Poster exploration — v01**, select **People & access**, and invite **Jamie Chen**.
3. Close the room. Use **Demo identity** in the top bar to switch to Jamie.
4. Open the invited draft and leave feedback. Try **Brand study — v01**: access is denied.
5. Switch to **Platform operator** to inspect ciphertext. Its direct draft-opening API is denied too.

Every member can create and open their own projects, edit project details and upload PNG, JPEG, WebP or TXT files up to 1 MB. To test the new invitation flow, open a project, select finished drafts and create a link. Switch to another demo member, open that link and accept; return as owner to confirm the recipient, then approve in **Approvals**. Demo personas must stay in the same browser/profile.

![Creator workspace](docs/creator-workspace.png)

### What local demo mode means

Demo sessions are simulated. WebCrypto AES-GCM keys are held in browser IndexedDB, shared by all demo personas in that browser. Server records contain ciphertext, but this harness is **not a security boundary between demo users**. Use synthetic work only. A different browser has no copy of these demo keys. The demo server binds loopback and cannot run with `--production`.

## Connect real TideCloak

Follow **[the step-by-step Vietnamese setup guide](docs/TIDECLOAK.md)**. It includes Docker Compose, realm enrollment, member/approver setup, client configuration and live acceptance checks. Read [the agreed product brief](brif.md) and [local collaboration / future HTTPS sharing](docs/SHARING.md).

After placing the public adapter in ignored `data/tidecloak.json` and configuring `.env`:

```bash
npm run dev
```

Without an adapter, this command shows setup instructions and fails closed for protected APIs. It does not silently use demo identities.

```bash
npm run build
npm start
```

The production command requires real Tide configuration. This is a hackathon prototype: complete the live tests and review deployment requirements before hosting it for real users.

## Validation

```bash
npm test
npm run build
```

Browser tests use a dedicated port and separate test data. Install Chromium once:

```bash
# macOS / Linux
PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright npx playwright install chromium
npm run test:e2e
```

```powershell
# Windows PowerShell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.cache/ms-playwright'
npx playwright install chromium
npm run test:e2e
```

See **[validation results and limits](docs/VALIDATION.md)**. Passing local tests does not prove a live Tide network integration.

## Architecture and team handoff

| Area | Files |
|---|---|
| React review workspace | `src/App.jsx`, `src/styles.css` |
| Browser encryption and Tide policy signing | `src/lib/crypto.js`, `src/lib/tide.js` |
| Express API, profiles, invitations and approvals | `server/app.js`, `server/collaboration.js` |
| Project rooms, invite pages and approvals UI | `src/components/Collaboration.jsx`, `src/lib/tide-admin.js` |
| Optional member-auth proxy, sharing setup | `server/shared.js`, `scripts/start-share.ps1` |
| Demo sessions and real JWT verification | `server/auth.js` |
| Atomic single-process JSON store | `server/store.js` |
| SDK policy parser bundled for Node | `server/tide-policy-runtime.js`, `scripts/build-policy-runtime.mjs` |
| API and browser checks | `tests/` |

Runtime files are under ignored `data/`; generated bundles, browsers and test state are under ignored `.cache/`. Do not run multiple app processes against the same JSON store. In Tide mode, members see their own projects and drafts with active grants; the operator sees storage metadata. Known participant identities and activity metadata are not encrypted. Demo mode keeps sample project metadata visible for denied-access demonstrations. Original file contents and feedback are encrypted. Audit records are ordinary app logs, not a tamper-proof ledger.

Read [CONTRIBUTING.md](CONTRIBUTING.md), [the current MVP scope](docs/MVP.md), and [workstreams for teammates](docs/TEAM.md). Removing an invitation stops subsequent API access; a saved Tide policy can work until expiry and already-read plaintext cannot be recalled. Tide mode requires DPoP proof verification. Policy requests have a separate group-approver queue. Tide governance requests use the administrator's own session; this prototype has not verified a multi-person quorum. Public sharing blocks Tide admin/master routes; approvals remain on the host's localhost workspace.

## Team and submission

**HCMUS - Old Ferrari — RMIT SGS**, RMIT Hackathon 2026, Challenge 2. Submission team name (preserved from the team's README): `RMIT_SGS_HCMUS - Old Ferrari_C2`.

- [x] Public source repository and a runnable local prototype.
- [x] Local TideCloak realm, adapter and login entry configured.
- [ ] Verify real enclave signing and the sign/encrypt/share/decrypt/refuse flow.
- [ ] Resume and verify multi-device HTTPS after changing the host network.
- [ ] Record the two-minute `.mp4` under 100 MB inside `demo/`.
- [x] Overview updated with current behaviour and verification limits, under 300 words.
- [ ] Submit the repo URL through the [official form](https://forms.gle/HRHYjnqB86j1LFS97).

Recorded Vietnam deadline: **22 October 2026, 18:00 (UTC+7)**. Publishing this repository alone does not submit the entry.

[Challenge brief](https://tide.org/unlocked/) · [TideCloak docs](https://docs.tide.org/) · [Third-party notices](THIRD_PARTY_NOTICES.md)
