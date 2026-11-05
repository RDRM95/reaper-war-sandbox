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
