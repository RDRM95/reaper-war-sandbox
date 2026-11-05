# Asset pipeline

The project now includes 13 original, reference-informed low/mid-poly `.glb` meshes and synthesised audio. Flat procedural shapes remain as a loading/error fallback. No extracted BioWare assets are bundled.

Reference study and provenance: [`SHIP_AND_AUDIO_REFERENCES.md`](SHIP_AND_AUDIO_REFERENCES.md), including direct links to original game imagery, fan orthographics and CC0 sound sources.

## Ship GLB replacement

1. Place a `.glb` file in `public/assets/ships/`.
2. Register it in `public/assets/ships/models.json`, e.g. `{"sovereign":"reaper-capital.glb","kilimanjaro":"alliance-dreadnought.glb","normandy":"normandy-sr2.glb"}`.
3. In Blender or your model editor, point the ship's **bow along +X**, **up along +Z**, and put the model centre at the origin. Apply transforms before exporting GLB.
4. Restart or refresh the app. The 3D renderer will use the GLB for that ship type; the 2D viewer keeps its readable top-down icon until an appropriate silhouette is provided.

Custom GLB geometry is instanced on the GPU by ship class. The entire model is loaded once per class, node transforms are baked into geometry, and each drawable material becomes one `InstancedMesh` spanning all class members. Even large fleets now use the detailed models rather than silently reverting to flat placeholders. Further LOD work will help at very high unit counts.

## Fidelity checklist

- Top-view silhouette matches original reference, including main hull shape and appendages.
- Side profile, bow, aft and wing geometry match references.
- Correct nacelle positions, engine colour and firing origin.
- Approximate physical length is retained relative to other classes.
- Lower-poly LOD exists for distant fleets.
- Material and texture quality should match the user's desired era, not gratuitous high-frequency noise.

## Audio

There is no copyrighted soundtrack or game sound. The starter makes lightweight original oscillator sounds only after AUDIO ON is clicked. A dedicated audio event layer is ready for later replacement with original or appropriately licensed samples, spatial mixing and impact timing.
