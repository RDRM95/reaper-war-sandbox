# Sci-Fi Tech Transplants — experimental battle mode

This is an opt-in gameplay modifier for the Mass Effect Reaper War spectator simulator. It **does not** replace a timeline (Canon, APEX or custom) and **does not** require new ship models.

## Use

1. Open the Fleet Builder.
2. Expand **SCI-FI TECH TRANSPLANTS** (off by default).
3. Check **ENABLE EXPERIMENTAL TECH**.
4. Pick **ADAMANTIUM + VIBRANIUM ARMOUR**.
5. Apply to **all organic ME fleets**, **Side A organic fleets**, or **Side B organic fleets**.
6. Launch a battle, or use **INSTANT BATTLE RESULTS**.
7. Uncheck the box to restore unmodified timeline damage.

The option is not retroactive. Redeploy the battle for a changed setting to take effect. Existing saved battle scenarios and presets are not modified by this mode.

## First transplant: adamantium + vibranium

An entirely fictional Marvel-crossover gameplay interpretation:

- **Adamantium outer hull:** greatly reduces post-barrier hull damage from shells, Thanix rounds and Reaper main-gun streams. Adamantium armour does not ablate under routine hits.
- **Vibranium inner structure:** absorbs much of the shock transmitted into the ship, improving crew and system survival.
- **Exposed equipment remains vulnerable:** critical engines, sensors and weapon mounts can still lose effectiveness. Lasers and thermal effects are less strongly mitigated.
- **HADES-style internal warheads:** cannot teleport past intact exotic plating merely because residual exposed-system damage occurred.
- **Reaper Hardcore:** the scripted conventional capital-beam one-shot assumption is bypassed for this exceptional defence, while ordinary beam damage still applies.
- **Strategic calculator:** estimates additional endurance without introducing thousands of ship entities.

Reapers and geth are deliberately excluded from the first *organic fleets* transplant. The catalogue may later add synthetic technologies and per-faction permissions.

## Architecture

- `src/simulation/techTransplants.ts`: typed data registry, faction/side eligibility, defensive effect schema, calculator multipliers.
- `src/simulation/types.ts`: optional battle configuration and per-ship resolved defensive effect.
- `src/simulation/battle.ts`: technology is resolved when each ship deploys, including reinforcements.
- `src/simulation/damage.ts`: actual per-impact effect and remaining vulnerable systems.
- `src/simulation/quickBattle.ts`: approximate attrition adjustment.
- `src/simulation/reaperHardcore.ts`: prevents conventional one-hit doctrine from invalidating the special armour.
- `src/main.ts` + `src/spectator.css`: optional panel and launch wiring; renderer stays untouched.
- `tests/techTransplants.test.mjs`: eligibility, opt-in and armour effect checks.

## Extending the registry

A later entry in `TECH_TRANSPLANTS` can introduce *offence, propulsion, shielding, sensors, electronic warfare, energy handling or special abilities*. The registry is deliberately independent of visual assets. New effect channels will need their own simulation integration; adding an entry to the catalogue alone does not create behaviour.

Do not assign arbitrary hull HP boosts to represent exceptional armour: damage reduction and vulnerable subsystems produce much more interesting battles.

## Validation

Run:

```bash
npm install
npm run test
npm run build
```

Compare the same seed, fleet counts and scenario with the toggle off and on. Off should preserve the baseline result. On should produce significantly lower hull damage for organic ships, while Reaper ship stats remain unchanged. Combat is still seeded and autonomous.
