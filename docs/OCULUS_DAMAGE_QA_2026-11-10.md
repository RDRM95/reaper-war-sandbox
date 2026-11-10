# Oculus interceptor damage — 10 November 2026

This ports the focused Codex rules fix: anti-small fighter Reaper beams use
`fighterStrength`, without stacking the ship-beam multiplier. In Annihilation,
Oculus raw damage/s changes from 36.4 to 26 (a 0.85 s raw burst budget of 30.94
to 22.1). Capital Reaper damage/s remains 2660 per emitter and its capital-only
kill override is unchanged. Other Annihilation bonuses remain. Explicit fighter
and organic Thanix upgrades remain functional. No save/schema changes.

The existing capital kill override already excluded Oculus; this repairs a
separate multiplier stack, not a capital one-shot inheritance bug. Numbers
are simulation balance estimates, not canonical statistics. The licensed
[ME2 endgame guide](https://primagames.com/eguides/mass-effect-2-eguide/walkthrough/walkthrough/endgame)
supports a threatening Normandy-attacking interceptor, without an exact damage ratio.

Validation:

- All **12 Node tests** pass, including three new tests that transpile and load
  the production catalogue/rules rather than duplicating the calculation.
- TypeScript and production build pass.
- The browser Oculus fixtures cover APEX and Annihilation, seeds 7/42/1337,
  real targeting/movement/weapons, effective pulse damage 26, and close optic
  captures. Parent guns and further launches are held to isolate the fighters.
- The Codex companion has seven unit regressions including landed bursts through
  the actual simulation against fighter/frigate/cruiser/dreadnought targets,
  plus a reusable natural 30 s dogfight probe. Canon samples are unchanged;
  Annihilation Oculus damage drops by removal of the extra 1.4 multiplier.
- Browser rendering is cloud Chromium/SwiftShader, not RTX 5090 measurement.

No geometry, AI, movement, formation, weapon range or renderer code changes in
this patch. The overlapping large-fleet reach drafts remain separate.
