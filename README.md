# Project overview

**CreatorRoom** is a collaboration workspace for unreleased creative work, where creators share selected drafts with specific reviewers without giving the platform universal access to their content.

**Vision & originality.** We focus on a small creative team's draft-review workflow: one project, selected assets, invited reviewers, and feedback. The intended experience keeps collaboration convenient while separating platform administration from access to unreleased work.

**Trust constraint.** Creators often have to trust a hosting service with readable copies of valuable drafts. We aim to let the service coordinate reviews while protected content remains encrypted and readable only through an authorised recipient's decryption flow.

**Value & impact.** A student designer could share a poster draft with an external reviewer while keeping another project's assets private. The reviewer can contribute feedback without receiving access to the creator's entire portfolio.

**Why TideCloak matters.** The planned integration uses TideCloak identity and supported encrypted-data access mechanisms to bind content access to authorised reviewers. Authentication alone will not be presented as end-to-end encryption. Recipient scoping, operator visibility, and any future-access withdrawal must be verified against the actual integration.

**Prototype & storytelling.** This repository currently contains the project brief and collaboration scaffold; a working application and TideCloak integration are not implemented yet. The target demo shows an invited reviewer opening one draft, failing to open another project's asset, and an operator seeing ciphertext in storage.

## Team

- **Old Ferrari**, RMIT Saigon South (SGS)
- RMIT Hackathon 2026 — Challenge 2, UNLOCKED
- Submission team name: `RMIT_SGS_OldFerrari_C2`

## Setup

There is no runnable application yet. Do not expect `npm install` or `npm run dev` to work until the application scaffold is added.

Clone the repository, then read [the MVP brief](docs/MVP.md) and [the collaboration guide](CONTRIBUTING.md).

```bash
git clone https://github.com/nhbl-ai/creatorroom-old-ferrari.git
cd creatorroom-old-ferrari
```

Suggested starting point: the [official TideCloak Quickstart](https://docs.tide.org/get-started/Tidecloak%20Quickstart), which scaffolds a Next.js client/server application. Confirm the current prerequisites and complete Tide enrollment before building on the template. Keep generated credentials outside version control.

## Repository layout

- `src/` — reserved for application source once the stack is scaffolded.
- `docs/MVP.md` — user journey, integration questions, and acceptance checklist.
- `docs/TEAM.md` — workstreams for teammates to claim.
- `assets/` — synthetic or team-owned demo assets only.
- `demo/` — final two-minute MP4 and demo notes.

The application scaffold may adjust this layout to match its framework conventions.

## Submission checklist

- [ ] Working prototype with real TideCloak integration.
- [ ] Verify reviewer scoping and ciphertext storage; document limitations.
- [ ] Update the Project overview to describe only demonstrated behaviour; keep it at 300 words or fewer.
- [ ] Add tested installation and run instructions.
- [ ] Add a two-minute `.mp4` under 100 MB inside this public repository.
- [ ] Submit the repository URL through the [official Google Form](https://forms.gle/HRHYjnqB86j1LFS97).

Vietnam deadline recorded in the verified event brief: **22 October 2026, 18:00 (UTC+7)**. Publishing this repository does not submit the entry.

Challenge: [Tide UNLOCKED](https://tide.org/unlocked/). Technical reference: [TideCloak documentation](https://docs.tide.org/).
