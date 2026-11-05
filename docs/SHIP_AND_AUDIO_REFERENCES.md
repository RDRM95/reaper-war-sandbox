# Mass Effect visual and audio research pack

Purpose: reference-first production notes for the new **spectator-only Reaper War Sandbox**. These are links for artists/developers to inspect, **not bundled art assets**. The project currently ships its own simple procedural hulls and generated audio. Before marking any ship "reference-authentic", compare the actual geometry with at least two views of the target vessel.

Sources are attributed and classified carefully: *game/codex* describes the official design; *community orthographic* diagrams and *fan artwork* help clarify geometry but are not themselves official concept art. Do not redistribute illustrations, extracted models or original game sounds without appropriate rights.

## Official-game appearance and ship construction

| Vessel / system | Reference link | Provenance | What to match |
| --- | --- | --- | --- |
| ME3 Alliance dreadnought (Kilimanjaro exterior geometry) | [ME3 dreadnought multi-angle model reference](https://www.therpf.com/forums/media/mass-effect-3-alliance-dreadnought-reference-by-troodon80-d524euo.22247/) | Community reference sheet of ME3 design | Long narrow wedge, layered centreline spine, distinctive paired rear prongs, blue stripes, engine placement, side-profile depth |
| Alliance York-class cruiser | [York-class orthographic views by Euderion](https://www.deviantart.com/euderion/art/Systems-Alliance-York-class-cruiser-Overview-802452424) | Fan orthographic interpretation based on ME designs | Long narrow prow, aft parallel drive elements, stepped central hull, four-view proportion |
| Alliance cruiser model | [Alliance cruiser miniature photograph](https://www.eplanetx.net/masseffectalliancecruiser.html) | Physical model of game ship | Prow-to-engine proportions and underslung sections |
| Normandy SR-2 | [Normandy SR-2 orthographic illustration by unusualsuspex](https://www.deviantart.com/unusualsuspex/art/SSV-Normandy-SR2-ortho-435301782) | Fan orthographic with multi-angle views | Arrow-like nose, swept wings, paired engine nacelles, central fuselage and stealth hull geometry |
| Normandy SR-1 | [Normandy SR-1 reference](https://www.pinterest.com/pin/574631233681481152/) | Repost of unusualsuspex ship reference | Older SR-1 differs from SR-2; maintain distinct outlines if added later |
| Sovereign-class Reaper | [Reaper dreadnought multi-angle reference](https://www.moddb.com/mods/mass-effect-dawn-of-the-reapers/images/reaper-dreadnought-me3-v2) | Fan model for Dawn of the Reapers mod, derived from ME3 appearance | Leaf-insect-like main body, elongated tapered spine, multiple asymmetric-depth forward claws, broad articulated limbs; no generic oval saucer |
| Sovereign (side profile) | [Sovereign 3D model screenshot](https://sfmlab.com/project/4bd54c6e-8304-48d9-8255-1aac7f636b2b/) | Community presentation of a Reaper character mesh | Segmented overlapping armour, recurved limbs, forebody weapon centre |
| Reaper destroyer | [The Art of the Mass Effect Trilogy: ME3](https://masseffect.fandom.com/wiki/The_Art_of_the_Mass_Effect_Trilogy/Mass_Effect_3) | Art book summary and screenshots | Compact Reaper variant, folding forward weapon faceplate, clearly different scale/silhouette from capital Reaper |
| Fleet and ship scale | [Euderion top-view size comparison](https://www.deviantart.com/euderion/art/Mass-Effect-Top-View-Size-Comparison-Chart-427768304) | Fan compilation / size study | Relative silhouettes from above; **don't substitute chart dimensions for in-game specifications without checking** |
| Cerberus cruisers | [Cerberus cruiser concept by Euderion](https://www.pinterest.com/pin/cerberus-cruisers-by-euderion--818107088567664705/) | Fan artwork | Split-tine angular profile, gun spine, compact engine clusters, white/black/orange colouring |
| Cerberus cruiser mod model | [Mass Effect Reborn Cerberus cruiser](https://www.moddb.com/mods/masseffectreborn-classic/images/our-cerberus-cruiser-with-3ds-max) | Fan-made model, not BioWare canon | Detailed engine/nacelle grouping and panel density; AU inspiration only |
| Cerberus dreadnought | [Cerberus dreadnought fan ortho](https://www.pinterest.com/pin/cerberus-dreadnought-ortho-by-unusualsuspex-on-deviantart--536983955544326247/) | Fan-made ship illustration | Long sharp prow, layered broadside armour; use for AU Black Fleet only |
| Alliance fleet formations in ME1 | [Alliance Navy cinematic image](https://masseffect.fandom.com/wiki/Alliance_Navy) | Captured game imagery | Federation-style fleet composition, escorts screening larger ships |

## Combat staging and mechanics

- [Mass Effect Codex — Ships and Vehicles](https://masseffect.fandom.com/wiki/Codex/Ships_and_Vehicles): authoritative game-text starting point for Mass Effect fleet doctrine. Dreadnoughts open fire at enormous range, escorts screen them, cruisers support flank protection, and frigates perform close wolf-pack attacks. Far-range axial targeting matters; don't have all big vessels knife-fighting at point-blank range.
- [Mass Effect Codex — Weapons](https://masseffect.fandom.com/wiki/Codex/Weapons%2C_Armor_and_Equipment): mass accelerators fire slugs rather than generic continuous neon lasers. Maintain charge, recoil impulse, projectile travel, and kinetic-barrier impact separation.
- [Mass Effect 3 release-era screenshots](https://www.mobygames.com/game/55078/mass-effect-3/screenshots/): source for restrained 2012 colours, glows, exposure, effects and density of detail.

## Sound direction

- [Rob Blake, ME3 Audio Lead interview, 2012](https://www.soundandvision.com/content/sv-interview-mass-effect-3-audio-lead-rob-blake-page-2): distinct pneumatic/mechanical weapon Foley and dynamic range. Use as a design cue, not as downloadable audio.
- [The Sound Design of Mass Effect 3 — Game Informer](https://gameinformer.com/b/features/archive/2011/04/18/the-sound-design-of-mass-effect-3): original production discussion.
- [Mass Effect 3 sound and weapon design](https://designingsound.org/2011/04/20/mass-effect-3-sound-weapon-design/): background on production choices.
- [Kenney Sci-Fi Sounds — CC0](https://kenney.nl/assets/sci-fi-sounds): 70 freely usable sci-fi/engine/laser sounds; optional sample source for later audio layering. The pack was verified as CC0 by its publisher, but is not bundled in this initial source archive.

For sound implementation: build **original** layered cues: (a) pre-fire charging hum, (b) hard mechanical launch/transient, (c) body/low-frequency tail, (d) barrier impact, (e) hull impact, (f) break-up. Make each shot's timing and distance responsive to the simulation. Do not bundle ripped original game audio or songs.

## AU-exclusive ships requiring original modelling

- **SSV Normandy Valkyrie / NOVA:** 2,020 m Apex experimental dreadnought; user-established long spinal NOVA battery, enormous elongated hull, recognisable but not enlarged SR-2. Normal/overcharge 200/300 gigatons in AU lore. Place muzzle at bow and match visual charge time to damage event.
- **SSV Omaha / HADES:** Cerberus super-dreadnought; functional spinal penetrator system, many point-defence mounts, angular dense armour, subtle red/white identifiers, blue engine glow. Distinct from Normandy Valkyrie.
- **Olympus and other Apex dreadnoughts:** retain Alliance grey-blue plate engineering and centreline mass accelerator with plausible rear drives, weapon emitters and spatial scale.
- **Reaper variants:** the Reaper destroyer is anatomically distinct from Sovereign; Harbinger has its own reinforced form, not a scaled-up default oval.

## Concrete art acceptance process

1. Save **source-page URLs and author credit** in this file before modelling a new class.
2. Prepare three matching reference angles: top, side and three-quarter (ideally game screenshots and orthographic).
3. Block out hull as simple volumes. Compare bow width / body width / total length, wing/nacelle spacing, engines and limb layout to references before adding surface details.
4. Preserve the same silhouettes in **both** 2D and 3D viewers. The two cameras must represent the same ship type.
5. Check weapon origin and orientation: blue Alliance mass accelerators from the forward main gun; red Reaper beams from the appropriate body/projector; near-white NOVA flash from the actual Valkyrie spine.
6. Mark unverified concepts as **AU interpretation** and review before treating them as canon references.

## Rights and reproducibility

These links are a design bibliography only. They are not an assertion of free-to-redistribute rights. The repo contains no copyrighted reference images, ripped meshes, music tracks or audio samples. GLB models are optional user-supplied/original assets under `public/assets/ships/`. If a source page disappears, seek the original artist's current page and update attribution.
