# APEX ship model fidelity pass — November 2026

## Source and status
Reference-informed original procedural work. The visual source images were supplied
for private development and are not redistributed in this public repository.
This is a **model improvement candidate**, not a six-view-certified game mesh.

Source imagery inspected:
- `Cerberus/Cerberus_Cruiser_Kiesling.png`: elongated forward rails, angular armor, black inset channels, muted orange upper panels.
- `Cerberus/Cerberus Dreadnaught.jpeg`: heavy axial cannon and layered capital armour.
- `Cerberus/Cerberus Everest Conversion.jpeg`: colour and military conversion lineage, fan concept only.
- `Alliance/Kilamonjaro.jpeg`: paired aft structures, narrow main axial profile and shielded gun channel.
- `Alliance/Normandy_SR2_Orthographic.jpg`: silhouette cues for experimental Alliance APEX hulls.
- Other uploaded source art is not bundled or claimed as canonical.

## Implemented model candidates
| Class ID | Changes | Status |
| --- | --- | --- |
| `cerberus_omaha` | New independently selected 1,800 m Black Fleet Omaha with split bow, deeply recessed central HADES gun, stepped armour, wide casemates, separate blue aft drives, orange/graphite palette | Candidate; six-view review outstanding |
| `alliance_omaha` | Retains its existing 1,800 m gameplay class and Alliance spinal cannon; gains distinct outriggers, side armour and heavy weapon casemates | Candidate |
| `alliance_aegis_command` | More distinct command dorsal section, sensors and outboard structures | Candidate |
| `alliance_valkyrie` | Additional NOVA emitter shrouds and aft outboard nacelles; retains 2,020 m class identity | Candidate |
| `cerberus_cruiser` | More faithful swept shoulders, long gun keel, hull dark channels and aft armour | Candidate |
| `cerberus_dreadnought` | Split axial nose and stepped armour with side casemates | Candidate |

The Cerberus Omaha is not represented as a repaint of the Alliance Omaha.
`cerberus_dreadnought` remains an independent generic capital class.

## Rules and game mechanics
- Existing class IDs, stock weapons, fleet calculations and physics are preserved.
- New HADES and Omega systems are **APEX AU-only**, with independent weapon definitions.
- HADES uses the existing internal-warhead and armour-bypass damage resolver;
  **not** an invented pre-scripted kill animation.
- New class is excluded by strict-canon lore checks.
- Builder uses ordinary merged five-material geometry for fleet instancing,
  with no extra frame-by-frame physical parts.
- Source reference registry (43 user-supplied entries) is unchanged; its provenance
  flags remain frozen and do not falsely certify the new model.

## Review checklist
1. Capture top, bottom, port, starboard, bow, stern and 3/4 views
   of Alliance Omaha and Cerberus Omaha at matched 1,800 m scale.
2. Verify silhouettes and black/white material boundaries against the
   three uploaded Cerberus references and the Alliance dreadnought reference.
3. Check the HADES muzzle at (0, -24, +878) metres visually versus its
   simulation hardpoint at (0, -24, +850) metres. This deliberate 28 m
   offset is a muzzle-to-internal-weapon-origin visual extension.
4. Confirm bridge, aft propulsion and battery placement; avoid adding
   visible gunfire without actual simulation events.
5. Run full TypeScript build, headless battle tests, browser reference and
   scripted-scene checks. Measure actual hardware frame time before claiming
   an increase for fleets of thousands.

## Not included in this pass
Fully rebuilt official ME3 meshes, licensed third-party art assets,
automatic six-view visual approval, manually reviewed screenshots, and
measured RTX 5090 performance. The remaining reference ships are a
separate follow-up review, not falsely marked complete.
