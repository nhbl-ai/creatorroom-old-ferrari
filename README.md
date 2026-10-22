# Project overview

**CreatorRoom** helps students, independent creators and community teams review unreleased creative work with selected people, encrypting drafts and feedback before upload.

**Vision & originality.** Getting useful feedback should not require publishing unfinished work or sharing an entire folder. CreatorRoom combines draft-specific invitations, owner confirmation and encrypted review. A member can own one project and review another; new uploads stay outside earlier invitations.

**Trust constraint.** A service holding readable drafts becomes another party creators must trust. Our intended Tide deployment separates workspace administration from permission to decrypt a particular draft. Owners confirm who claimed an invitation before a separate approver signs access.

**Value & impact.** A student preparing a community campaign can invite a volunteer mentor to one poster while keeping other drafts private. Independent designers and local storytellers could use the same workflow. The intended social value is wider access to feedback with understandable sharing boundaries; impact has not yet been measured.

**Why TideCloak matters.** The real adapter uses SDK authentication, server-verified JWTs, strict DPoP and signed policies scoped to a recipient's Tide key and draft ID. A group administrator approves requests in their own browser; ordinary members need no realm-admin authority. Multi-person quorum protection remains unverified.

**Prototype & storytelling.** Local tests cover projects, one-use invitations, approvals, encrypted feedback, forbidden reads and ciphertext inspection. Watch a reviewer open the invited draft and be refused another. Demo identities and browser keys are simulated. A local Tide realm and login entry are configured; member linking, real enclave signing and cross-user encryption await human acceptance. Multi-device HTTPS is deferred.

## Why this matters in practice

Creative work improves through feedback, but sharing an early draft can expose more than its creator intended: an unpublished concept, a client's proposed identity, or comments explaining a campaign before it is ready. A student or a small community team should be able to ask for a second opinion without making every draft available to every collaborator.

CreatorRoom starts with a narrow, useful task: **share this draft with this reviewer for this review**. The unit of collaboration is the individual draft. Feedback receives the same encryption treatment as the file because a comment can reveal its message, design or subject.

| Intended users | A realistic review task | Intended benefit |
| --- | --- | --- |
| Students and volunteer mentors | Review a portfolio poster before a deadline | Seek outside guidance without opening unrelated drafts. |
| Independent designers and small studios | Invite a client to comment on one proposed design | Keep access tied to the work being discussed. |
| Community organisations | Ask a volunteer to review an unpublished campaign visual | Coordinate feedback while limiting access to campaign content. |
| Local-language creators | Invite a trusted reader to comment on a story excerpt saved as TXT | Get human feedback in the draft's language without publishing it first. |

These are proposed uses, not reports of adoption. Local-language review means people reviewing their own content; the prototype does not provide translation or automated language support. Its current file scope is PNG, JPEG, WebP and TXT, up to **1 MB per upload**.

## From a draft to a useful conversation

Imagine a student designing a poster for a neighbourhood arts event while another client's branding project is also in their workspace.

1. **Prepare.** The student creates a project and requests upload access. In Tide mode, a separate group approver signs the policy in their own browser; the student then encrypts and uploads the draft.
2. **Invite.** The owner selects completed drafts and creates a one-use link. The recipient signs in and claims it; the owner confirms their account identity before requesting access approval. Later uploads are not included.
3. **Review.** After approval, the invited reviewer opens the selected draft and leaves feedback. The browser encrypts comments before upload too.
4. **Keep the boundary.** Requests for unrelated drafts are refused by the API. A separate operator can inspect stored ciphertext but cannot open protected drafts through that API.
5. **End the review.** Removing access blocks subsequent API requests. It cannot erase content someone has already read, and a copied Tide policy may remain usable until expiry.

The local simulation covers this workflow. Separate-user decryption and operator refusal by the actual Tide network still need live acceptance testing.

## What works today

| Area | Current evidence | Remaining work |
| --- | --- | --- |
| Review workspace | Local projects, profiles, uploads, one-use invitations, owner confirmation, approvals and encrypted feedback | Observe real review sessions and improve usability. |
| Access decisions | Server checks ownership and active draft grants; JWT and DPoP tests cover cryptographic proofs | Verify decisions alongside live Tide network enforcement. |
| Tide setup | Local realm, adapter and login entry configured; member-linking helper implemented | Complete actual member linking, enclave approvals and cross-user encryption. |
| Sharing | Local browser access; optional sharing proxy and setup script implemented | Verify HTTPS and two-device sign-in after the host changes networks. |
| Social benefit | Concrete mentoring and community-review scenarios | Run a small pilot; no user-impact results are claimed. |

The next proof is a live review between two independently linked Tide users, followed by failed decryption attempts from an unauthorised account and operator. See [validation results and limits](docs/VALIDATION.md).

## Setup

### Run the local demo

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

### Connect real TideCloak

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

## A practical path to social value

Our first proposed pilot is a small student design club working with volunteer mentors, using synthetic or team-owned drafts. Before involving real confidential work, complete live Tide acceptance tests and verify the separate approver workflow.

The pilot should answer whether people can actually obtain feedback with less unnecessary exposure:

| Question | Measure to collect |
| --- | --- |
| Can a first-time creator complete a review invitation? | Completion rate and time from upload to successful reviewer access. |
| Does the workflow help people get useful feedback? | Completed reviews and creator-rated usefulness of comments. |
| Do users understand what they are sharing? | Whether they can identify who can open each draft and what invitation removal does. |
| Does the boundary hold in practice? | Results for wrong-user, wrong-draft, operator and expired-policy attempts. |

These are evaluation measures, not achieved results. Findings would guide the next iteration: simpler onboarding, clearer access explanations and a tested approval workflow. The social goal is to make useful collaboration more accessible while giving creators understandable control over participation.

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

The [validation record](docs/VALIDATION.md) documents 20 local API/security/orchestration tests and three Chromium demo workflows. These include fixtures and simulated identities; the live Tide acceptance record remains pending. Passing local tests does not prove a live Tide network integration.

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
