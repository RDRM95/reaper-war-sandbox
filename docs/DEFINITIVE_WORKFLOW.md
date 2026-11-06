# Reaper War — definitive build workflow

## Two maintained products, one gameplay specification

**Codex Build (`RDRM95/reaperwarCodexBuild`, default `codex/apex-combat-overhaul`)**
is the definitive game for campaign, chronology, character/world-state choices,
fleet orders, reports, technology, codex and strategic alternate universes.

**Spectator Sandbox (`RDRM95/reaper-war-sandbox`, default `main`)**
is the lightweight battle viewer, 4K/large fleet graphics benchmark,
numerical fleet builder and shot-following camera test bench.

Do **not** concatenate repos or replace either UI. A forced merger would make
one application inherit the other's performance cost, test assumptions and
screens. A future monorepo should extract a shared `@reaperwar/core` package
only after a verified test parity run and a clean release tag from both.

## Shared authoritative code

Changes to these modules should be copied/reconciled in BOTH products until
the common package is extracted:

- `src/scenarios/auLibrary.ts`: the named AU chapters; same scenarios and
  rosters in both. No forced winners or narrative buffs slipped into damage.
- `src/scenarios/catalogQA.ts`: checks every AU faction, class and hardpoint.
- `src/data/ships.ts`, `src/data/weapons.ts`: gameplay definitions.
- `src/simulation/motion.ts`, `battle.ts`, `ai.ts`: fixed-step motion,
  targeting and collision; do not replace with graphic-only kinematics.
- `src/simulation/killScoreboard.ts`: event-derived class losses, not estimates.
- `src/simulation/quickBattle.ts`: O(class count) numerical force estimates,
  clearly marked approximate and independent of the 20 Hz sim.
- `src/rendering/ships` and `src/references`: approved geometry/QA with
  explicit AU provenance and metre-scale consistency.

Each repository retains its own renderer quality settings and responsive
user interface. The GPU-instanced spectator should not be slowed down by
importing the Codex campaign UI.

## Content chronology / isolation

The APEX successful-Refuse timeline (2185–2195) has NO Crucible victory.
The 2186 Crucible temporal anchor, TIM's 2206 Control branch, Harbinger's
memory loop, and the 2885 post-Destroy Ascendants are independent hypothetical
AUs; do not combine their technology or background by default.

Canonical 2186 ships must remain available under Strict Lore. Apex, named
Valkyrie, serial Aegis, Ascendants, Axiom and future designs use AU
provenance, never presented as official Mass Effect canon.

Large strategic orders (e.g. Harbinger's 52,500-vessel offensive against
22,600 conventional ships) should use **Instant Battle Results** by default.
This reports estimated losses, duration and side/class statistics; it must
not instantiate tens of thousands of individually animated hulls just to
produce a number.

## Animation and propulsion acceptance

- Ship IDs, trajectory, targeting and muzzle/hit events are simulation-owned.
- High-mass hulls limit sustained sideways primary acceleration; fine RCS
  control remains available near formation stations and during clearance.
- `engineThrust` means actual positive forward force, not moving speed.
  `inertialCoast` means drifting with little or no aft engine plume.
- Fighters bank appreciably, escorts subtly; dreadnoughts and Reaper capitals
  stay heavy/level. Reaper limb articulation must remain mechanical, not rubber.
- Gunnery camera must remain at real axial gun offset and only respond to
  confirmed main-battery fire and damage events.

## Required validation before merging

1. Build/typecheck and headless simulation tests for each repo.
2. AU catalogue QA: every faction owns its ships, mounts refer to actual
   weapons, no accidental duplicate IDs, correct rules/arrival.
3. Seeded retreat, avoidance and station-keeping tests.
4. 1, 10 and 50 Aegis command hulls can deploy with distinct ship IDs;
   the unique Normandy Valkyrie remains a separate class.
5. Kill scoreboard deduplicates `ship_destroyed` events and resets.
6. Codex browser: campaign, briefing, numerical-only report and large-fleet
   UI responsiveness. Spectator browser: 2D/3D, camera, reference scene,
   class scoreboard, instant 75,100-hull calculation and browser controls.
7. Source-reference approval remains manual; a procedural ship is not an
   official silhouette until six-view captures actually pass.
8. **Do not claim** 4K/60 FPS at 5,000 ships without measuring on the target
   GPU/CPU. The `benchmark:4k` script samples local performance, not CI's
   software-rendered browser.

## Outstanding technical debt

Full source-based P0 model rebuilds, canonical-sized damage zones, richer
ship-level textures and decals, secondary turret animations, GPU-based
weapon pools and VRAM-aware LOD tuning. Do not mark these as complete merely
because there is a registered placeholder or a visual effect.
