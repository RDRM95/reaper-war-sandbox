# Reaper structural LOD — current sandbox checkpoint

## Current source and release state

- **Branch:** `fix/reaper-structural-lod-20261110` in `RDRM95/reaper-war-sandbox`.
- **Feature parent:** `46d6c227aed6b274886c013aca877bd7cd803fe7`.
- **Fresh upstream parent:** `7ba24bd5dc12399c0b3b7aa8c2b8f022ce510f5d` (`main`, merged Reaper geometry PR #33), including hidden-layer/Ascendant-length PR #32 (`bfb66b5`).
- Fresh `main` was inspected and merged cleanly with `--no-commit`; this combined worktree is under final validation. No owner branch was rewritten. The feature has not been merged or deployed.
- PR creation/merge through the configured GitHub API is forbidden in this environment. A pushed feature branch and green checks do not constitute PR approval or a completed release; resolve that publication gate before claiming deployment.

## Correction and ownership

The LOD pass retains Reaper structural geometry and both weapon optics while reducing decorative overlays and nested arm lighting. Hero details are captured recursively once. GPU batches and heroes share the same layout-aware policy: legacy hulls use structural `plates`; rebuilt hulls use structural `carapace` and decorative `plates`.

The geometry rebuild, graphite palette, hidden-layer guard, barrier adapter and Ascendant length correction are independently authored changes already merged upstream. They are integrated through their actual history, not recreated here. The current Reaper builder and materials match the corresponding Codex source byte for byte. The shared `lod.ts` and `shipLod.ts` helpers also match Codex.

No simulation, damage, targeting, motion, save format, ship scale, muzzle/engine attachment or spectator UI changes are introduced by the LOD correction. The sandbox retains its own rig/controller; the Codex static-rig selector is not copied over it.

## Validation on the combined source

- All **seven MJS test files pass: 24 assertions**, verified by direct per-file execution as well as `npm test`. This includes nine LOD cases and three upstream length/attachment cases.
- Production TypeScript check and Vite build pass (89 modules).
- Complete retained reduced geometry is independently pinned: capital **25,151 vertices**, Harbinger **24,671**, destroyer **18,143**. Both optics remain; decorative plate and seam batches reduce. Testing complete geometry avoids relying on the first name in a legitimately merged material batch.
- Full Chromium browser suite is running against the combined source; update this line with its final result before release. Earlier legacy-source results remain separate below.

```sh
npm test
npm run build
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test --workers=1
```

Local browser checks use system Chromium with ANGLE/Vulkan SwiftShader. The Playwright-managed browser cache is absent locally; CI provides the default-browser check. No target-GPU or RTX performance claim follows from these tests.

## CI evidence and the earlier failure

The pre-integration feature parent `46d6c22` passed both actual GitHub checks:

- [Full verification 42837786373](https://github.com/RDRM95/reaper-war-sandbox/actions/runs/42837786373): **30 passed in 5.1 minutes**, total 5 minutes 53 seconds.
- [Graphics verification 42837786184](https://github.com/RDRM95/reaper-war-sandbox/actions/runs/42837786184): **success**, total 3 minutes 14 seconds.

Earlier parent `25bb41e` failed [verify run 42835934611](https://github.com/RDRM95/reaper-war-sandbox/actions/runs/42835934611) with only an exit-code annotation. Detailed reporters were added; the failure did not reproduce on `46d6c22` and its exact cause remains unknown. No assertions, timeout or retry setting was weakened. That older unexplained failure is not described as repaired, and green parent checks do not replace checks on the final combined commit.

## Rendered evidence and limits

[Legacy LOD evidence](qa/reaper-lod-20261110/README.md) preserves the original models, negative control and earlier captures. The control restored only the original GPU classification: three expected capital/Harbinger/destroyer failures, four unaffected checks passed. A later compatibility-only pass left all five legacy PNG hashes and transition JSON identical; this historical comparison is not a claim that the subsequent geometry rebuild is visually identical.

Final combined-source captures and telemetry are to be added after the current browser run. Rendering checks require WebGL error 0, no page/render errors and exact unchanged serialization of physical ship state, events, projectiles, missiles, tick and RNG through nine production LOD transitions. Magnified portraits select production reduced LOD first, then move only the camera without another LOD update or mesh scaling.

Structural-render acceptance does not approve private source-reference likeness or close issues #16/#19. Six-view source approval, listening acceptance, sustained high-count combat profiling and target-GPU 4K acceptance remain distinct requirements.

## Files and next task

Owned adapters/tests: `src/rendering/lod.ts`, `shipLod.ts`, `battleView.ts`, `instancedFleet.ts`, `tests/reaper-lod.test.mjs`, `e2e/reaper-lod.spec.ts`, optional system-browser selection in `playwright.config.ts`, generated-output ignore rules and this QA record. Upstream model/material/barrier changes remain attributable to their merged source commits.

**Next:** finish combined browser/visual checks; commit and push the merged feature; require green CI on that exact head; create/review the focused PR once repository API access is available; then verify the post-merge deployment. Continue the current programme checkpoint and existing P1 combat/formation work without duplicating its active branches or marking the 43-model source-reference programme complete.
