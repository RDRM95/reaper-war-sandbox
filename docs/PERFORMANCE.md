# Large-fleet performance notes

The spectator supports manual fleet quantities in the thousands, but **this branch does not guarantee a particular ship count or frame rate**. Actual performance depends on per-ship hardpoints, missiles, camera, resolution, browser and GPU driver.

## Changes

- Carrier housekeeping now indexes active fighters by carrier once per simulation tick. This removes repeated full-fleet scans when many carriers are operating.
- 2D rendering skips off-screen hull glyphs; capital ship labels use spatial buckets rather than all-pairs overlap tests.
- Combat feed DOM updates are throttled to HUD cadence instead of rebuilding on every combat event.
- Fixed-step 20 Hz combat simulation remains authoritative. A 9 ms per-frame simulation work budget and a maximum of 10 steps prevent runaway catch-up stalls. Under load, **simulated time can run slower than wall-clock time**, rather than freezing rendering. Replay determinism is preserved by the unchanged fixed-step core.
- 2D mode releases the 3D WebGL renderer/scene and event buffer; returning to 3D constructs a new view of the *same* battle state.
- Far-ship GPU point cloud capacity raised from 2,048 to 16,384. This does not itself increase the maximum number of actively simulated vessels.

## Hardware

On a Ryzen 7 9800X3D / RTX 5090 / 64 GB PC, use a current Chrome or Edge browser with hardware acceleration enabled and the discrete GPU selected in Windows graphics settings. Three.js requests a high-performance WebGL context. This does **not** mean the simulation automatically uses all CPU cores or CUDA cores: simulation currently runs on the browser main thread and GPU primarily renders the scene.

## Benchmark checklist

Test 500, 1,000, 2,000 and 5,000 total deployed ships with the same seed and class mix, in both 2D and 3D. Record 1% low FPS, average FPS, simulation-seconds per wall-clock minute, CPU main-thread time, draw calls, GPU memory and live projectile count. Repeat with carriers/fighters and mass point defence, which are substantially heavier than equal numbers of frigates.

## Next bottlenecks

1. Replace per-ship 3D Object3D hulls with **InstancedMesh** batches per class/material/LOD; current renderer creates an object hierarchy per vessel.
2. Spatial-index weapon and missile acquisition to avoid repeatedly scanning all enemy contacts and projectiles per hardpoint.
3. Move fixed-step simulation to a Web Worker using transferable typed-array snapshots; preserve seeded event ordering.
4. Batch and cap visible projectiles, effects and destruction debris.
5. Add on-screen simulation TPS, FPS, draw calls, and GPU timing where supported.

Do not claim a 5,000-vessel battle runs at 60 FPS until it has been benchmarked on the intended hardware.
