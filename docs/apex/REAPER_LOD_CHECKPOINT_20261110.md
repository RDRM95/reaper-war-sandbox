# Reaper structural LOD sandbox checkpoint

## Ownership and source state

- Date: 10 November 2026.
- Repository: `RDRM95/reaper-war-sandbox`.
- Feature branch: `fix/reaper-structural-lod-20261110`.
- Prepared against current `main` commit `188f2c18e1c7c97294196ab22e5f7d87846832ea`.
- Codex counterpart was prepared against `f8e9681937ca7c1e063265550cc4ee59aeb0ddf8` on `codex/apex-combat-overhaul`.
- This checkpoint describes the locally verified feature. No PR, merge or deployment is claimed here. The commit is recorded in the feature branch history.

## Completed bounded correction

Reaper armour (`plates`) and weapon apertures (`eye`) were classified as disposable decoration and disappeared from reduced GPU batches. Hero LOD considered only direct children, so nested articulated arm-seam lighting did not reduce. The port uses the same role-aware classification and cached recursive hero-detail list as Codex, preserving authored hidden decorations and the previous thresholds.

The sandbox has a different Reaper rig from Codex and no static replacement selector. Its model and rig are retained. No hull geometry, palette, animation controller, simulation, damage, muzzle/engine node, UI or save format changes are included. The separate sandbox PR #32 remains unmerged; its visibility guard/Ascendant scale correction is not silently incorporated.

## Verification

- `npm test`: all six configured MJS test files pass. Direct execution of each file confirms **19 assertions** pass, including seven new Reaper LOD assertions. The Node 24 outer runner reports file-level cases.
- `npm run build`: production TypeScript check and Vite build pass; 89 modules built.
- Original GPU classification control: three expected failures (capital, Harbinger and destroyer armour instance count), four unaffected checks pass. The production working tree remained patched throughout the control.
- Initial focused Chromium check: 1 passed in 13 seconds.
- Full Chromium browser suite: **30 passed in 4.6 minutes**, one worker, no retries. Existing catalogue, numerical battle, graphics, gunnery, Oculus, orbital lighting, scene scripting, references and spectator controls pass alongside the new LOD regression.
- The final new browser check passed in 12.8 seconds within that suite, including the magnified portraits. All nine full/reduced/full transitions have WebGL error 0, no page/render errors and exact unchanged simulation/RNG serialization. Actual renderer: ANGLE / Vulkan SwiftShader Device (Subzero).

Browser commands:

```sh
npm test
npm run build
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test --workers=1
```

The optional executable-path configuration supports this cloud's system Chromium. Without that variable, the existing Playwright-managed browser selection is unchanged.

## Visual evidence

[QA record and captures](qa/reaper-lod-20261110/README.md) contain actual sandbox renders, the renderer/transition telemetry and the negative control. The magnified reduced portraits were inspected: structural carapaces and apertures remain present while nested arm lighting reduces. They select production LOD first and then move only the camera for inspection; no mesh enlargement or physical state change is used.

This is structural-render acceptance only. It does not approve private source-reference likeness or claim that the broader Reaper geometry/palette programme is finished. Six-view source approval, sustained high-count combat profiling, listening acceptance and target-GPU 4K performance remain outstanding programme requirements.

## Files and reconciliation boundary

- Shared policy/helpers: `src/rendering/lod.ts`, new `src/rendering/shipLod.ts` (byte-identical to the Codex pass when ported).
- Local adapters: `src/rendering/battleView.ts`, `src/rendering/instancedFleet.ts`.
- Regression/QA: `tests/reaper-lod.test.mjs`, `e2e/reaper-lod.spec.ts`, this checkpoint and `qa/reaper-lod-20261110/`.
- Harness: optional system Chromium path in `playwright.config.ts`; generated browser output ignored by `.gitignore` while curated QA remains tracked.
- CI: the existing verification and graphics workflows also run on this specific feature branch, using their normal tests unchanged. GitHub PR API calls return `Forbidden` in the cloud environment, so push checks provide reviewable evidence while PR creation/merge access is restored. This does not bypass PR or deployment gates.

PR #32 also edits `instancedFleet.ts`, but its hidden-ancestor visibility guard and this pass's detail classification are independent. Reconcile the individual changes rather than copying the complete file over either branch. Concurrent carapace/material and P1 combat/formation work remains outside this port.

## Exact next task

After committing this feature, obtain green PR checks and verify the merged deployment. Continue the independently owned carapace/limb/palette slice with six-view and context evidence; reconcile the existing hidden-limb/Ascendant-size port separately. Do not repeat completed optics, orbital-lighting or Oculus-damage fixes.
