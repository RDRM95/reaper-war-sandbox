# Rear-rank reach and class movement port

Companion to [Codex Build PR #26](https://github.com/RDRM95/reaperwarCodexBuild/pull/26), addressing the cinematic combat acceptance and large fleets whose rear ranks cannot fire.

`engagementReach.ts`, `propulsion.ts` and `motion.ts` match the Codex implementation. Reachable local contacts replace unreachable automatic selections; unreachable firing stations can close inside the real gun envelope. Class-dependent lateral/reverse cruise limits preserve catalogue forward speed and acceleration-limited braking. Explicit targets, retreat interception and the anti-chase boundary retain their policies.

## Sandbox integration

The Sandbox keeps its contact broad phase and in-range target-lock fast path. The fast path ends at actual gun range so a locked target just beyond range cannot suppress repair.

A distant rear echelon can request the exact nearest shared non-fighter contact. `CombatSpatialIndex` builds an occupied-cell bounding tree lazily per simulation tick. Queries use current hull positions, conservative movement bounds and deployment-order ties. New non-fighter arrivals invalidate the tree; dead/escaped hulls are rejected. This avoids adding a whole-fleet fallback scan for every isolated ship.

The 20,000-hull fixture's twelve exact nearest queries visit **997 candidates out of 240,000** possible full-scan visits. Correctness is checked against a full scan, including distant observers, ties, movement and newly added hulls. This is a CPU candidate-work measurement, not a rendered 20,000-ship battle or GPU FPS result.

## Validation

- Node tests: **17/17 pass**, including acceleration limits, sustained lateral/reverse movement, inertial engine failure, station reach and indexed-contact correctness.
- Production build/typecheck pass.
- Production simulation in Chromium: 1,000-ship seed-42 harmless control, 90 nominal km, Prime/Apex mixed line. **166/166 allied rear main batteries fire by 180 simulated seconds**, with **94.6%** of initial allied width retained. Damage alone is disabled; targeting, movement, arcs, heat and ammunition stay live.
- Canon and Prime/Apex reference engagements, seeds 7 and 8: Reapers win the canon cases; organics destroy the Reaper force in the APEX cases. The browser fixture checks a repeated seed-7 APEX event log and final hull/position state for exact equality.
- Browser coverage includes main-gun attachment, optical zoom, quality changes, persistent signal loss, Continuous POV, Free Explore and POV preflight.

[Codex measurements, lore sources, numeric handling estimates and before/after captures](https://github.com/RDRM95/reaperwarCodexBuild/blob/fix/class-engagement-reach-20261109/docs/apex/ENGAGEMENT_REACH_QA_2026-11-09.md) document the shared policy. Speed fractions are simulation estimates; Mass Effect's codex establishes class roles and relative handling rather than exact tactical speed tables.

## Merge boundary and remaining work

Keep this PR in draft until Codex #26 is reconciled with the unpublished P1 combat/formation branches named in Codex #25. Preserve the Sandbox-specific indexed adapters when porting the combined implementation. Avoid stacking two movement controllers.

Large formation depth still creates long closing times. The 400-capital open-3D wedge improves allied rear batteries from 0/66 to 63/66 by 150 s, but rear Reapers only improve from 0/66 to 7/66. Formation-depth, Reaper slew, wolfpack behaviour and fleet-anchor redesign remain in the P1 programme. No RTX 5090/4K frame-rate result is claimed from cloud software rendering.
