# REAPER WAR — Spectator Sandbox (greenfield project)

## Product rule

**Fleet-building is the only tactical decision.** After Launch, ships independently choose targets, manoeuvre, fire, and withdraw as their health and weapon condition dictates. The player is a director and observer, not a fleet commander.

## Three layers

1. **Simulation:** pure TypeScript, deterministic fixed-step, named units, fixed seeds, reusable for ship and eventually ground combat.
2. **Presentation:** Stellaris-like 2D fleet spectator camera and switchable three-dimensional cinematic camera. Neither is allowed to change outcomes.
3. **Assets:** replaceable GLB ship models, weapon VFX and licensed/original audio; these must not determine combat mechanics.

## Phase 1 — runnable build

- Fleet builder for Alliance, Cerberus, Reapers; basic presets; explicit seed; launch / replay.
- Ship classes, shield recovery, capital beams, MAC rounds, HADES, NOVA, Oculus drones.
- Autonomous targeting and broad formation behaviours.
- 2D silhouette view and 3D orbital spectator camera.
- Ships selectable for health, shields, weapons, kills; optional follow camera.
- Visual shots, explosions, launch sounds synthesised locally in the browser.
- No turn-based controls, research tree, campaign UI, orders, economy, construction or menus within the battle.

## Phase 2 — cinematic asset fidelity (underway: model blockouts in v0.2)

- Replace approximate fallback geometry with properly proportioned, game-inspired or user-provided licensed GLB models. Establish ship reference packs showing top, side, bow, rear and three-quarter views.
- Verify armour silhouettes, major hull modules, forward/backwards orientation, propulsion locations and faction silhouette readability before adding surface detail.
- PBR metal/roughness texture maps kept within performance budget; scaled LOD models and instanced distant ships.
- Beam charge-up, main-gun impulse, laser travel, hit flashes, barrier ripples, failed penetration and wreck breakup animations.
- Separate original-sound-design cues: engine, beam wind-up, MAC discharge, metal impact, barrier impact, internal detonation, positional mix; optional user-provided legal audio.
- Camera presets: fleet overview, cinematic flyby, capital kill replay, selected ship chase, flagship bridge, missile camera.

## Phase 3 — richer simulation

- Distinct battle-group controllers (screen, picket, main line, artillery group, carrier wing), formation reorganisation and repositioning, target prioritisation and disengagement.
- Broad engagement geometry and relative ship scale, not cramped close-up orbiting.
- Meaningful shields, armour facings, damage modules, tactical heat and cooling, weapon traverse and charge-up.
- Recording/replay state from the same deterministic simulation; compare seeds and fleet compositions.
- Headless simulation and scalable instanced rendering for >1,000 ships.

## Phase 4 — ground-war expansion

- `CombatEntity` and `CombatDomain` interfaces for ships, aircraft, infantry, armour, fixed batteries, atmospheric craft and fortifications.
- Ground layers are simulated independently of cameras and share events and damage rules only where sensible.
- Ship-to-ground and ground-to-orbit fire support, orbital defences, planetary assault/siege, evac transports and mission outcomes.
- Surface representation starts with abstract simulation + 2D/3D spectator ground views; avoid tactical micromanagement.

## Scope guard

Never reintroduce tactical click-to-move, complex strategy economy, mission tree, empire diplomacy, multistep loadout editor or unrelated features unless explicitly requested. Every addition should make the battle easier to watch, more plausible or better presented.

## Mass Effect visual goal

Reference-authentic silhouettes and sounds require reference assets. Procedural starter hulls are intentionally placeholders. A two-angled thumbnail or AI guessed shape is **not** accepted as finished model fidelity. User-provided models/screenshots or legally distributable models should be reviewed and matched to physical dimensions.
