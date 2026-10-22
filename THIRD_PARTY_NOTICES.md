# Third-party notices

The Tide policy-signing integration in `src/lib/tide.js` is adapted from Tide Foundation's [Relationship Attestation reference helper](https://github.com/tide-foundation/raziel-mcp/blob/master/templates/relationship-attestation/relationship.ts). It retains the prescribed SDK flow and adds CreatorRoom API calls, per-draft scope, expiry and UI integration.

Copyright in the upstream materials remains with their respective authors. The Tide-derived material is subject to the **Tide Community Open Code License**, included verbatim in [licenses/Tide-Community-Open-Code.txt](licenses/Tide-Community-Open-Code.txt). The materials are distributed without warranty as stated in that licence. No MIT or Apache relicensing of Tide material is claimed.

The app depends on `@tidecloak/js`, `@tidecloak/verify`, `@tideorg/js`, and `heimdall-tide`; consult the licences included in those packages and [Tide's licence page](https://tide.org/licenses_tcoc2-0-0-en). Other dependencies retain their own package licences. `node_modules`, generated runtime bundles and browser binaries are not committed to this repository.

Sample posters in `src/lib/samples.js` and decorative CSS covers were created for this prototype and do not include third-party client artwork.

The DPoP verifier in `server/dpop.ts` is adapted from Tide Agent Pack `templates/dpop-verify/verifyDpop.ts`; its replay retention and algorithm allowlist are tightened for this single-process Express app. The relay HTML is copied byte-for-byte from `@tidecloak/js`. Branding assets are generated with Tide Agent Pack's `enclave-branding` scripts.
