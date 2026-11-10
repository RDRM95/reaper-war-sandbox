# Reaper LOD port: renderer evidence

This is the sandbox port of the bounded Codex structural-LOD correction. It does not rebuild or resize any ship. The production Sovereign-class, Harbinger and destroyer models retain their existing geometry, materials, muzzle and engine nodes.

## Reproduction and correction

The original shared name-based detail policy classified `plates` and `eye` as close-up decoration. Reduced GPU batches therefore removed the Reaper carapace and weapon aperture. Hero reduction also considered direct children only, leaving arm-seam lights visible below mechanical pivots.

The port shares `isLodDetail`, `captureLodDetails` and `applyShipLod` with Codex. Reaper structural armour and eyes remain present at reduced LOD. Decorative running lights and nested arm seams reduce and restore through a cached per-hero list. Other faction detail rules and all camera thresholds remain unchanged.

`gpu-classification-control.txt` records a controlled reproduction: loading the original `188f2c1` GPU batching module with the new regression harness fails the capital, Harbinger and destroyer batch assertions (armour instance count 0 instead of 1). The four other assertions pass. The production source was not modified for this control.

## Automated checks

`tests/reaper-lod.test.mjs` loads the real models, catalogue and renderer with the existing TypeScript/Node test toolchain. Seven assertions cover structural batch retention, recursive hero reduction, full/reduced/point/restored transitions, unchanged geometry bounds and attachment nodes, visual independence from ship state, unchanged non-Reaper policy and authored hidden decorations.

`e2e/reaper-lod.spec.ts` creates a real `BattleView` in Chromium. Each of the three hulls goes through full/reduced/full production updates. A selected capital hero shares the scene with GPU-instanced ships. It checks actual batch membership, nested visibility, WebGL errors and an exact before/after serialization of ship state, events, projectiles, missiles, tick and RNG state.

The initial focused browser run passed in 13 seconds. Complete-suite and final magnified-capture results are recorded in the [development checkpoint](../../REAPER_LOD_CHECKPOINT_20261110.md) after execution.

## Captures and limits

- `reaper-capital-reduced-hero-and-batches.png`: ordinary production reduced-distance frame. Hulls are small at this distance; use telemetry rather than this frame alone to assess structural retention.
- `reaper-destroyer-restored-full.png`: actual restored full-detail frame.
- `reaper_capital-reduced-magnified.png`, `harbinger-reduced-magnified.png` and `reaper_destroyer-reduced-magnified.png`: select the production LOD first, then move only the camera for inspection without another LOD update or mesh rescaling.
- `reaper-lod-transition-records.json`: actual renderer, all nine transitions and errors.

These are original procedural game renders. They are not private source-reference imagery, manual six-view approval, sustained combat benchmarks or target-GPU/RTX performance evidence. The Codex six-view evidence remains a separate record. The sandbox has no static-limb replacement selector, so this port does not add one or merge the separate hidden-limb/Ascendant-size PR #32.
