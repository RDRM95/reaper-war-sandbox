# RTX-style graphics pass and reproducible benchmarks

This branch upgrades the **existing Three.js renderer**. The fixed-step battle core, ship identity, fleet rosters, collision/fire control, existing camera modes, HUD controls and orbital positions remain the authorities. Quality changes do not alter battle seed, simulation time, ship state or weapon timing.

## Implemented

- GPU-instanced distant hull geometry and exhaust cones, shared by ship class, with no per-ship scene graph for the instanced vessels. A maximum of 96 nearby/selected/filmed ships are shown with individual original meshes per frame. Selected ships and all ships in the scene can still be inspected using their original IDs.
- Distance-based mesh/point LOD, screen frustum checks, 16,384-point far-fleet buffer, and exact per-class batch sizes. Reduced LOD omits detail geometry while preserving hull silhouettes. Distant engine sprites and battle effects are budgeted.
- Planet surface and cloud textures generated deterministically at 512/1024/1536/2048 pixels depending on preset, plus a separate rotating cloud sphere and a sun-facing atmospheric limb shader. **The planet's original position, radius and camera framing are not moved.** These are high-resolution *procedural* textures; they are not NASA/BioWare art.
- Existing physically based metallic hull materials and emissive engines retained. Ultra adds a restrained UnrealBloom post-processing pass. Standard ACES tone mapping and sRGB remain.
- Quality-budgeted GPU-instanced mass accelerator tracers, missiles, beam slots and point-defence lines. Explosions and HADES effects continue to read the original authoritative simulation events. No changes to damage, weapon cadence or hit calculations.
- Real-time HUD telemetry: browser FPS, draw calls, triangle count, sim CPU work per frame and GPU timer where the WebGL2 extension is supported.

## Presets

| Preset | Planet width | Bloom | Engine trails | Weapon effects |
| --- | ---: | --- | --- | --- |
| Performance | 512 px | No | Off | Reduced |
| Balanced | 1024 px | No | On | Medium |
| High | 1536 px | No | On | High |
| RTX Cinematic | 2048 px | Yes, restrained | On | Maximum |

Quality can be changed at runtime without resetting the simulation or selected camera. These are *render quality* presets, not claims of hardware ray tracing.

## Reproducible static reference

Open:

```
http://localhost:5173/?reference=sol-42&t=18
```

This reproduces Sol Defence with seed 42 and advances exactly 18 simulation seconds in 0.05-second steps. The simulation is paused and a fixed comparison camera is placed at (600,420,950) render units, aimed at the origin. Compare Performance and RTX Cinematic using the quality selector; the same ship IDs, positions, HUD and camera remain in place. GitHub Actions runs a Playwright test that takes both PNG screenshots and checks the ship-state and camera arrays for equality.

**Limitation:** The provided screenshot is a visual reference, not a recoverable camera transform or simulation save. We cannot claim pixel-perfect composition matching until its original camera and battle-state metadata are supplied or captured in-game.

## Live fleet stress tests

Run `npm install`, then `npm run dev`. These URLs launch the normal **running** battle rather than a paused comparison:

```
http://localhost:5173/?ships=1000
http://localhost:5173/?ships=3000
http://localhost:5173/?ships=5000
```

The fleet-count parameter is opt-in. It rescales the stock Sol scenario's two rosters proportionally, preserving faction and class composition as closely as integer rounding allows. Default seed remains 42. Normal gameplay and custom fleet building are unchanged when this parameter is absent.

At each count, test High and RTX Cinematic at a real **3840 × 2160** display resolution. Allow 30 seconds for the battle to settle, then inspect the HUD and run `window.__reaperDiagnostics()` in the browser developer console. Record FPS, p95 frame time, draw calls, triangles, GPU frame time (if supported), and simulation time advanced per 30 wall-clock seconds. Do three trials per size; compare medians and 1% low FPS from a longer capture.

The 60 FPS frame-time budget is **16.7 ms**. Do not confuse `renderCpuMs` (CPU-side renderer submission time) with actual GPU processing time. `gpuFrameMs` uses `EXT_disjoint_timer_query_webgl2` when available, otherwise returns null. The CI software renderer is not a replacement for 9800X3D/5090 measurements.

## Assets not yet provided

- Licensed, high-quality Alliance and Reaper GLB meshes with game-accurate silhouettes, UVs, decals and LOD meshes.
- 4K/8K NASA-type Earth maps and properly authored material masks for non-Earth planets; current procedural imagery is a placeholder for geographic fidelity, although it is functional.
- PBR texture sets for authored ship meshes (albedo, metallic, roughness, normal, emissive).
- An original in-game screenshot's exact camera matrix and seed/time for pixel-level before/after comparison.

This code pass does **not** implement hardware ray tracing, full volumetric atmosphere, orbital planetary shadow maps or per-pixel temporal antialiasing. Those should not be described as shipped.
