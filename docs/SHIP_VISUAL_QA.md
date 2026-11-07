# Mass Effect Ship / Weapons / Combat Presentation Audit
_Engineering QA register — 6 November 2026_

## Scope / evidence boundary

This is an in-place visual and gameplay code audit, **not a claim of having
obtained or installed BioWare meshes, textures or sound recordings**. Runtime
models in this repository are original fan reconstructions built from procedural
Three.js geometry. The in-game reference inspector generates TOP, BOTTOM,
PORT, STARBOARD, BOW and STERN plus hero-angle captures. The registry
`src/references/ShipReferenceRegistry.ts` currently records P0/P1/P2/APEX
source status and `actualGameMesh: false` for every match, with approval
`not_reviewed` or `needs_capture`; visual likeness is **not automatically
approved** simply because a class can render.

The two products are kept aligned on shared battle rules and AU designs.
Codex is the primary game. Sandbox is the high-fleet graphics viewer.

## Implemented and inspectable

| Area | Current implementation | Evidence / test boundary |
| --- | --- | --- |
| Reaper anatomy | Procedural Sovereign-family cuttlefish carapace, curved arms, inset weapon aperture; Axiom shares the same family with small ancient scutes | Six-view visual QA needed; not official geometry |
| Alliance | Named Valkyrie distinct from repeatable Aegis, reinforced spinal rails, emissive engines and scaled hull lengths | Roster/class metadata and geometry present; close-up silhouette approval pending |
| Quarian/Geth/Asari/Turian/Cerberus | Distinct procedural faction ship builders | Existing model/reference tests; visual comparisons still need human approval |
| Active thrust | Real forward acceleration drives main engine lights; inertial coast produces dim idle lights, station keeping still uses RCS | Motion regression; no invented velocity animation |
| Capital motion | Heavy hulls resist unnatural sustained sideways acceleration; fine RCS, fixed AI goals and collision avoidance preserved | Motion/clearance simulation tests |
| Reaper articulation | Linked limb rig read from original ship model; slower/subtler for heavy units and LOD-gated | Reaper rig tests; cinematic review needed |
| Gunnery POV | Camera at true main gun; no secondary/PD fake firing; target lock and reload come from live state | Inspect camera and `gunnery.ts` events |
| Gunner reticle | Faint corner brackets, no opaque coloured square; critical warnings and brief signal loss | Browser UI regression |
| Beam hits | Unique deterministic rotating hull surface contact, not every beam to ship centre | `impactGeometry.ts` tests, `BattleView` source reads beamEnd |
| Slug impacts | Vary target silhouette location and enable bounded shallow-angle glances | Simulation impact/contact tests |
| Audio | Original procedural Web Audio: internal gun rumble, Thanix pressure/pump, Reaper field resonance, glancing confirmation, muted alerts | Action-locked via simulation events, not a sound-asset likeness claim |
| Effects | Reduced near-POV muzzle intensity; bounded glancing flare; pooled beam contact glows; batched point defence | Screenshots and browser performance regressions |
| Performance | Distant fleet GPU instancing and LOD in Spectator; capped tracers/beam effects, batched PD buffers | No measured local RTX 5090 4K FPS submitted |

## High-priority likeness acceptance queue

1. **Sovereign/Harbinger/Destroyers** — capture six orthographic views and
   two 3/4 shots; verify cuttlefish central shell, hood, arm root count,
   articulated claws, aperture placement and segment thickness. In
   particular, avoid conventional battleship silhouettes or symmetric wings.
2. **Alliance dreadnought, Normandy, Aegis, Valkyrie** — verify mast,
   hull length, axial weapon placement, bridge massing and engines. Aegis is
   serial-production AU fiction, not a renamed unique Valkyrie.
3. **Asari Destiny Ascension, Geth and Quarian** — source-led exterior
   shapes; do not claim a rebuilt class is canon accurate on class name alone.
4. **Materials / exposure** — dark PBR metallic shells, directional key
   lighting, minimal fog/haze and restrained effects. Hulls should be
   discernible without the background turning bright grey.
5. **Damage** — glancing impacts must use smaller sparks than a penetrating
   HADES/NOVA round. No permanent blinding beam termination flash.
6. **Sounds** — run listening QA at typical speaker/headphone gain. Keep
   internal hull sounds lower than the visual battle's peak explosions, and
   low-frequency effects below clipping. External sounds remain an intentional
   cinematic convention (space itself is silent).

## Before accepting a model or graphics change

- Preserve IDs, weapon hardpoints, `ShipState` transforms, target choices,
  exact 20 Hz simulation timing and spectator camera controls.
- Compare six-view captures before/after from `ShipReferenceInspector`.
  Check armour plates from front, profile and top—not just hero lighting.
- Audit actual catalogue hull length against rendered world bounding box;
  make sure hot engines light only under thrust.
- Test 1, 10, 100 and 1,000 ships in low/high graphics presets; sample
  draw calls, frame-time p95, GPU memory and sim step time. Do not treat
  software-rendered CI FPS as a benchmark for RTX 5090.
- Run Vitest, Playwright mission + gunnery + screenshot checks and
  `auditAULibrary`; keep Strict Lore separate from AU hulls.
- Mark source reference **approved only after side-by-side human review**.

## Known open issues

- Full handcrafted high-poly game-faithful meshes, source-accurate surface
  textures, decals and physically authored destruction debris require
  additional original art assets. Existing forms remain procedural.
- Exact beam geometry can still appear slightly outside thin visual hulls
  because the combat collider is a bounding sphere, not a per-triangle
  mesh. A future local-space BVH intersection layer should only change
  visuals until explicitly simulation-tested.
- High 4K FPS and VRAM usage on the user's PC are **not measured here**.
  CI confirms code and browser rendering with software WebGL, not a
  dedicated RTX 5090 performance result.
- Mechanical Reaper limb animation is present, but exact animation timing
  and canonical frame matching still require shot-based comparison.

This document is a gate, not a declaration that all P0 visual designs are finished.
