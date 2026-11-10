# Measured ship scale and reference framing

## Diagnosis

The current Reaper builders already produce a 2,000 m Sovereign and 160 m destroyer. Their nested model transform is uniform; no compressed root scale was found. Harbinger remains the project's 2,400 m variant, not a new canon measurement. The other author's accepted graphite hull, curved armour, stance, camera, glow and breakup work is preserved. Cinematic two-shot PR #38 and the unfinished combat branches were left separate.

The scale chain is 10 render units per kilometre. Measuring actual visible vertices through ancestor transforms exposed a different defect: the Alliance Trident has an 18 m catalogue datum but a 39 m visible mesh (36 m declared length, plus engine overhang). Its builder multiplied all dimensions by two. The reference inspector additionally imposed a 100 m minimum camera extent, making small craft tiny in supposedly fitted views. Independently fitted reference panels also gave no honest comparison of different ships' sizes.

## Changes

- **REF → True-scale comparison** places a capital, dreadnought, cruiser, frigate, destroyer and fighter together without changing their scales. Top and three-quarter orthographic views share a 500 m ruler, numbered hulls and a measurement table. Optional boxes show actual visible geometry, excluding hidden stand-in rigs. Catalogue provenance remains explicit.
- Individual reference views show measured length/width/height and catalogue length. Small craft now use their own extent instead of the 100 m floor. This is diagnostic presentation, not automatic source-reference approval.
- The Trident's original geometry is uniformly fitted and centred to its 18 m catalogue length. Both engine nodes receive the same transform. Drive-glow metadata cancels the renderer's large-hull minimum sprite size for this small craft. Its triangle budget remains 108; no per-vessel materials or draw calls were added. Simulation dimensions, gun hardpoints, physics, damage and RNG are unchanged.
- The comparison renders only when opened or a control changes. Its temporary WebGL renderer is released immediately; it never runs a background animation loop or disposes shared ship geometry.

## Measurements and checks

| Class | Catalogue m | Visible mesh length m | Width m | Height m |
|---|---:|---:|---:|---:|
| Sovereign | 2,000 | 2,000 | 724.8 | 460.4 |
| Alliance dreadnought | 888 | 878.2 | 258.6 | 135.5 |
| Alliance cruiser | 520 | 514.3 | 145.6 | 79.4 |
| Alliance frigate | 170 | 161.2 | 173.2 | 40.0 |
| Destroyer | 160 | 160 | 143.0 | 88.3 |
| Trident | 18 | **39 → 18** | 18.5 | 3.9 |

The other modest model/datum differences are reported, not silently stretched. Widths include wings/limbs; length is the local forward axis. Neutral-pose bounds differ from animated combat envelopes.

- Negative control: the new Trident regression failed on 39 m before the correction; the two unaffected measurement tests passed.
- Codex: **400 unit tests across 66 files pass**, TypeScript/build pass; production browser scale regression passes with identical serialized ships/events/tick/RNG before and after opening, rotating, bounding and closing the inspector.
- Integration parent `3ef65c9`: **397 unit tests, 39 complete production-browser tests pass**, including 300+ ship GPU batches, real HADES impacts, replay, campaigns, cinematic overlays and the updated Reaper LOD contract.
- Sandbox shared modules and Trident correction are ported, preserving its independently authored Valkyrie additions. Its 11 Node test files and build pass; the focused scale browser test passes. Parent `4b36caa` passes all 30 browser cases. Each final pushed head still requires its own CI.
- Actual software-rendered before/after captures and six views: [evidence in the Codex feature](https://github.com/RDRM95/reaperwarCodexBuild/tree/feat/measured-ship-scale-20261110/docs/apex/qa/ship-scale-20261110). Runtime/WebGL errors: zero. Comparison draw calls: **123 before and after**. Forty warm six-template measurement samples on cloud Node 24: median **0.93 ms**, p95 **1.17 ms**. This measures on-demand geometry inspection, not battle FPS or target hardware.

Reproduce sandbox checks: `npm test`, `npm run build`, `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test e2e/ship-scale.spec.ts --workers=1`. References supplied by the user remain outside Git; committed images show only this project's procedural renderer.

## Release boundary and next work

Branches remain isolated: `fix/reaper-structural-lod-20261110` (reconciled integration), `feat/measured-ship-scale-20261110` (this slice), `fix/results-survival-labels-20261110` (independent reporting correction). The playable integration can include them without claiming they have merged into the public bases.

GitHub's repository API was forbidden in this environment; pushes work. Create/review the focused PRs and require green current-head CI and confirmed mergeability before merging, then verify Pages. Do not close reference issues #16/#19: private six-view likeness acceptance, sustained high-count target-GPU/4K profiling, audio acceptance and broader combat work remain. Extreme Scale recovery is still experimental and excluded from the supported playable build.
