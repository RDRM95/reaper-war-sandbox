# Mass Effect: Reaper War — Build Direction

## Product
Autonomous, unscripted space combat sandbox, optimised for cinematic observation.
The player builds fleets, then the simulation controls movement, target selection and combat.
Optional controls: pause, speed, inspect/follow ships, focus target, release a ready spinal salvo, return to autonomy. No economy or empire management.

## Non-negotiable design rules
1. Prioritise fun, ship likeness, believable fleet engagement, meaningful destruction and clear weapon feedback.
2. No scripted winners, artificial survivor protection, invented shots or visual effects disconnected from simulation events.
3. Preserve actual fleet counts. For performance use LOD, culling, batched render work and spatial partitioning, never silently shrink battles.
4. Separate deterministic simulation from 2D and 3D viewers. Preserve ship-specific identity, statistics, weapons, damage and outcomes.
5. Capital-ship standoff, firing stations, convoy escorts, coordinated batteries, fighter/carrier operations, effective retreat doctrines.
6. Add future ground-combat systems through separate battle domains, not a rewrite of the space combat engine.
7. Mass Effect 3 (2012) silhouettes, materials, engine/weapon appearance and visual proportions are the target. Original fan assets only.
8. Canonical equipment and AU weapons need separate definitions. HADES internal nuclear penetrator and NOVA over-barrier capital killers are AU, not vanilla Mass Effect canon.
9. Real audio and visuals: acquisition → charge → discharge → flight → impact → barrier, armour, systems damage → debris.
10. Every major change must build, run browser checks, and have a realistic demonstration battle.

## Implementation priority
P0: reliable launch on Windows/GitHub; fleet builder including reinforcements; full autonomous combat; 2D/3D spectator.
P1: original detailed hull generator reuse, barrier/munition model, 3D formation and engagement-range behavior.
P2: ship model silhouette fidelity and original weapon audio; 3D camera director, ship follow and real target-tracking HUD.
P3: gunnery/target/reaper cameras, charge-up and impact timing, persistent wreckage, cinematic recording, large-fleet optimisations.
P4: tens-of-thousands fleet scalability, optional ground warfare interface.

## Current status
- v0.3 source-based spectator rebuilt from the original simulation, faction ship catalog, 3D hull generator, materials and weapon effects.
- Branch `codex/pure-battle-v1` adds Pure Battle configuration, timed reinforcements, focus/release commands.
- Branch `codex/targeting-cameras-v1` adds a read-only, ship-state-derived gunnery targeting HUD and HUD-free camera.
- The live GitHub Pages site remains on `main` until branch release is verified.
- Precise franchise ship likeness, primary-weapon charge animations, target-point cameras, persistent wrecks and extreme-scale fleet performance remain future engineering work. Do not advertise these as finished.

## Source model
Previous Reaper War repositories are references for battle AI, formations, canonical ship specifications, damage and rendering. Import only the necessary engines and hull builders; do not bring over campaigns, civilization development, diplomacy, tactical menus or save-management complexity.
