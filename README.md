# REAPER WAR — Spectator Sandbox

A **new, independent** Mass Effect-inspired space-battle sandbox. Build opposing fleets and watch them fight in either a clean 2D fleet view or a cinematic 3D orbital camera. There are **no tactical commands, economy or campaign menus**.

This is not a clone of the previous Reaper War simulator. The new architecture has a small, deterministic simulation core and separate renderers.

## Quick start

Requirements: Node.js 20.19+.

```bash
npm install
npm run dev
```

Open the local URL shown by Vite (normally `http://localhost:5173`).

To create a static release:

```bash
npm run build
```

The `dist/` directory is suitable for GitHub Pages. The Vite base path is relative (`./`).

## How to play

1. Choose a preset or edit ship counts for Side A and Side B.
2. Enter a seed. The same fleet composition and seed generates the same battle.
3. Click **LAUNCH BATTLE**. Ships manoeuvre and fire on their own.
4. Switch between 2D and 3D without resetting the engagement; click a ship to inspect it.
5. Pause, speed up, follow ships, enable basic original generated audio, and replay with the same seed.

The 2D viewpoint is inspired by the readability of Stellaris fleet battles; the 3D viewpoint uses original reference-informed dimensional models with instanced rendering. The default build now includes 13 newly generated, original 3D GLB hull models, including the Normandy SR-2, Valkyrie, Alliance dreadnoughts, Cerberus warships and three Reaper classes. These are reference-informed geometric interpretations; they are not extracted BioWare models or finished production textures.

## Structure

| Path | Purpose |
| --- | --- |
| `src/sim/` | Deterministic ship AI, weapons, shields, collisions of fire and seeded combat |
| `src/render/view2d.ts` | Fast top-down orbital spectator view |
| `src/render/view3d.ts` | Three.js orbital camera, rendering the detailed GLBs with GPU instancing for fleets of many ships |
| `src/render/audio.ts` | Original synthesised weapon cues |
| `public/assets/ships/models.json` | Included GLB ship manifest; replace a model here to use a new authorised asset |
| `docs/VISION.md` | Scope, design principles and ground-war roadmap |
| `docs/ASSETS.md` | Ship model and audio fidelity pipeline |

## Included reference-informed 3D models

All 13 catalogued ship classes have an original generated `.glb` in `public/assets/ships/`. The models have actual depth, stacked armour, distinct hull forms, spine weapons and blue or red emitters. The generator is versioned at `scripts/build_ship_models.py` (development dependency: Python `trimesh` and `numpy`). To regenerate, run `python scripts/build_ship_models.py`.

A 2D/3D camera switch observes the **same** simulation. No tactical controls were added. Unlike naive GLB cloning, the viewer creates instanced draw calls per model material and class, so the same model can appear hundreds of times. Source research and provenance are in `docs/SHIP_AND_AUDIO_REFERENCES.md`.

## Important current boundaries

- Core simulator is a **playable prototype**, not a finished fidelity overhaul. No tactical gameplay is intentional.
- Thirteen original reference-informed GLBs replace the initial flat extrusions. They are much more dimensional, but do not yet equal screen-matched game meshes or textures. Optional replacements can be registered in the manifest.
- The simulation uses abstract battle-space units and a simplified damage system, not a validated physical model.
- Fleet-wing behaviour is autonomous but basic; advanced group cohesion, manoeuvring, detailed fire-control and capital tactics are future work.
- Ground combat is architecturally planned but is not present in this initial build.
- Weapon audio is generated in-browser and is not ripped or duplicated from existing games.

## Deployment — new GitHub repository

Create a new empty repository such as `RDRM95/reaper-war-sandbox` (do not import the old repository). After unzipping:

```bash
git init
git add .
git commit -m "Initial spectator sandbox"
git branch -M main
git remote add origin https://github.com/RDRM95/reaper-war-sandbox.git
git push -u origin main
```

Or use GitHub Desktop **File → Add local repository** and publish. The existing Reaper War repositories remain unchanged.

For GitHub Pages, the included `.github/workflows/pages.yml` builds Vite output and deploys `dist/`. Enable Actions and GitHub Pages **GitHub Actions** source in repository settings.

## Credits and rights

Independent, non-commercial fan software. Mass Effect is owned by Electronic Arts/BioWare. No copyrighted 3D models, textures, sounds or music are included.

## Easy Windows launch and publishing

- **Simplest publishing route:** Double-click `PUBLISH_ONE_CLICK_WINDOWS.bat`. It checks for Git and GitHub CLI, offers to install either missing tool through Windows Package Manager, opens GitHub browser sign-in if needed, creates the separate public repository, pushes this project, and attempts to activate GitHub Pages. It never overwrites an existing repository.

- Double-click `START_WINDOWS.bat` after extracting the archive. It installs dependencies on the first run and opens the browser. Requires Node.js.
- Double-click `PUBLISH_GITHUB_WINDOWS.bat` to create an **independent** `RDRM95/reaper-war-sandbox` repository with the GitHub CLI (`gh`) and Git installed, and signed in. It does **not** push to or alter the original Reaper War repository.
- GitHub Pages workflow is included. You may need to select **Settings → Pages → Source: GitHub Actions** in the new repo to publish the site.

A geometric contact sheet of the newly authored models is in `docs/ship-model-preview.png`. It is a static mesh preview, not a real-time screenshot of the browser renderer.

## Local GPU Edition (Windows)

To install the local spectator build and keep it updated, extract this
repository's ZIP and double-click **`PLAY_LOCAL_GPU.cmd`**.

- First run requires **Git for Windows**, **Node.js 20.19+** and internet.
  The launcher installs an independent copy into
  `%LOCALAPPDATA%\\ReaperWarSandbox\\source`; it never overwrites this ZIP,
  an existing development checkout or manually edited source.
- Every later run attempts a safe `git pull --ff-only` from `main`. If
  offline or if you edited the installed code, it keeps your local copy.
- Dependency installation is skipped when `package.json` has not changed.
  The launcher builds the production version and runs Vite's production
  preview at **http://127.0.0.1:5173/** rather than its development server.
  Once downloaded, the game simulation and renderer run locally.
- The URL matches the original `START_WINDOWS.bat` browser origin, so
  ordinary local browser storage at that address is retained. GitHub Pages
  storage and storage on other hosts/ports remain separate; export data
  from the old origin before switching hosts.
- Keep the launcher window open while playing. The browser must have
  hardware acceleration enabled to use the GPU; the launcher does not
  bypass browser or graphics-driver safety controls.

Choose **HIGH** for sustained large engagements; **RTX CINEMATIC** includes
additional bloom and higher render resolution and is better suited to smaller
battles or close-up recording. The fidelity-preserving renderer optimisations
retain full close-range ship models and weapons, while distant hulls use
instancing and point sprites. The point buffer now grows beyond 16,384
vessels; this does not guarantee 60 FPS for very large fleets.

For repeatable **4K on-machine benchmarks**, first install the dev
dependencies in the local source folder, then in PowerShell run:

```powershell
$env:RW_COUNTS = '1000,3000,5000,20000'
npm run benchmark:4k
```

Results and screenshots appear in `benchmark-results/`. The benchmark
uses actual Edge/Chromium performance on the machine that runs it.


## Open 3D theatres and fleet movement

Battles use an **open, three-dimensional battlespace**—not a ground plane
or a fixed arena boundary. Each environment has a reference landmark:
a planet for orbital combat, a mass relay for relay encounters, the Citadel
for station defence, or open stars for deep-space engagements.

New preset/custom deployments use separate vertical approach corridors,
in addition to authored lateral and forward/back positions. The vertical
spacing scales with the opposing fleets' original horizontal distance,
so a close duel is not turned into a long approach. Pre-authored flanking
heights remain intact. Static defence platforms remain fixed. To preserve
an old scenario's exact deployment coordinates, pass world state
`theatre_layout: 'legacy_plane'`.

**Fleet doctrine:** capitals move with the fleet anchor as a firing line;
cruisers have more room to manoeuvre; frigate and fighter screens can
pursue threats. In the Codex/Spectator engines, the main battle line
takes a deterministic shallow curved approach rather than every ship
seeking one central point. Ships retain their actual collision avoidance,
turning limits, weapon ranges, combat AI and deterministic replay rules.

The planetary and relay visuals are **navigation references**, not opaque
invisible walls, scripted weapons or gravity wells. Sector overview
distances are planning/camera guidelines, not hard gameplay boundaries;
the existing simulation-distance compression still applies to combat.

For large-scale spectacles, start opposing fleets farther apart or deploy
reinforcement wings from separated x/z approaches; this produces a transit,
closing artillery battle and later close action without shrinking or
removing ship models. Cinematic camera modes can follow any member.


## Reaper Hardcore — Annihilation (optional)

Select **Reaper Hardcore — Annihilation** under the timeline/combat-rules
selector. This is a separate, reversible gameplay preset, not a change to
Canon, Strict Lore, APEX, or other saved timeline configurations.

- A capital-class Reaper's `reaper_capital_beam` destroys a **conventional
  warship on a successful actual hit** through the existing damage/destruction
  pipeline. Misses remain misses. Smaller Reaper beams do not gain an
  automatic kill.
- Specifically hardened AU hulls (`normandy_valkyrie`,
  `alliance_super_dreadnought`, `turian_super_dreadnought`,
  `alliance_omaha`, `alliance_aegis_command`, `alliance_valkyrie`)
  retain their defences and take heavy, bounded beam damage. Unprotected
  ships such as the Destiny Ascension are not special-cased.
- Reapers prioritise dangerous firing platforms, carriers, capitals and
  actual gun damage. Their gun line keeps station, destroyer screens
  intercept nearby escape attempts, and fleet commanders stop extending
  endless pursuit for a single fleeing target. Reapers do not retreat.
- The spectator camera can observe **actual Reaper main-beam launches**
  as they occur, without scripting kills or affecting the combat RNG.
- Indoctrination is disabled within this preset.

**Open-3D battlespace:** New game setup screens default to **OPEN 3D**.
Older saved scenarios, simulation API calls and replay seed benchmarks keep
their original coordinates unless `theatre_layout: 'three_dimensional'`
is explicitly selected. The setup screen also offers **ORIGINAL** to
compare battle outcomes on their previous tactical positions. Custom
starting distances now support up to 600 km; these map options do not
change weapon ranges or ship physics.

These features have automated regression tests, but FPS and play feel
should also be checked on the actual local GPU build.
