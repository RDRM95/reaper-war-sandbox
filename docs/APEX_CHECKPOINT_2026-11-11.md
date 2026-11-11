# Local Normandy SR-2 candidate

Original Normandy SR-2 silhouette work is on local branch `fix/normandy-sr2-profile-20261111` in both repositories. Codex was rebased without conflicts onto `d7f1313` after the 3D engagement PR #49 merged; sandbox starts at `86d0598`. No remote SR-2 PR or merge exists yet: external publication is awaiting explicit confirmation after automatic approval review rejected the coordination comment.

- Rounded fuselage, narrow swept supports, separate stepped nacelles, paired aft fins, deck joints/stripes and a dark flank belt. Measured beam/length 0.7943 → 0.4733; 216 m inferred gameplay length and gun datum retained. Exhaust nodes move with the revised nozzles and are verified by raycasts.
- Five material batches remain. Full/reduced triangles per hull 496/220 → 1,752/1,460. A staged 1,000-hull render uses 5/2 calls in both repositories. SwiftShader only; no hardware FPS claim.
- `docs/NORMANDY_SR2_QA_2026-11-11.md` records source quality, six-view inspection, tests and limits; `docs/apex/qa/normandy-sr2-20261111/` contains only renders of original code. Private references remain outside both repositories.
- Initial Codex checks: 411 unit tests, typecheck/build, 320- and 1,000-ship browser checks. The complete regression suite is rerun after the #49 rebase. Sandbox: 51 Node tests, typecheck/build, four selected browser cases (registry read passed on rerun after an edit-triggered reload). Final model tests pass in both.
- Issue #16 remains unapproved. Official product photos corroborate the major shape but are not game orthographics; underside details and exact dimensions remain provisional. No other faction's approval status changed.
- Shared combat, camera and LOD policy remain outside this candidate. Check live branches and PRs again before publishing or continuing; sandbox's 3D engagement port appeared while this work was in progress.

