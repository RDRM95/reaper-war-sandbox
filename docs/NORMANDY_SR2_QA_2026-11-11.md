# Normandy SR-2: narrower plan and curved fuselage

Status: original procedural reconstruction, **not visually approved** under issue #16. This is a focused ALL-002 improvement, not completion of the 43-class programme.

## Reference evidence and scope

- [BioWare / Dark Horse Alliance SR-2 replica](https://gear.bioware.com/products/mass-effect-normandy-sr-2-ship-replica-remaster): official licensed product based on ME3. Four photographs were inspected: elevated plan, deck close-up, aft/shoulder close-up and three-quarter. They corroborate the rounded fuselage, long bow, four separate nacelles, narrow supports, twin splayed aft fins, pale armour, dark flank belt and blue deck stripes. A collectible is not an orthographic game specification.
- [Overall three-quarter photograph](https://gear.bioware.com/cdn/shop/products/GRID-1_de014aea-df31-4466-b971-5a392134add0.jpg), [elevated plan](https://gear.bioware.com/cdn/shop/products/GRID-2_54cf7856-c04e-446d-978d-64bf3b08dce3.jpg), [deck](https://gear.bioware.com/cdn/shop/products/GRID-3_5f19b492-adbf-4c5f-9e02-d0d87fb6e51d.jpg), [shoulder and fins](https://gear.bioware.com/cdn/shop/products/GRID-4_1d17b84a-a6f8-46ee-ac0d-591f5bd847fb.jpg).
- Private fan multi-view material supplies additional plan, side and front comparisons. It is supplementary evidence, not official geometry or a canon dimensional authority. None of it is in this repository. A roughly 0.44–0.50 beam/length envelope is an estimate from these comparisons, not a published specification.
- The retained 216 m gameplay length is the existing catalogue inference; it is **not** certified canon. Registry length disagreements are untouched. No new game capture, complete official underside view or orthographic rear reference was obtained. The underside shell and small machinery details remain reconstruction estimates. No third-party mesh, texture or reference image is shipped.

The existing builder had a 1.60-unit beam against a 2.0143-unit rendered length, flat triangular wings and a thin box-shaped fuselage. The new builder uses a longitudinal elliptical shell, narrow sloping supports, separate stepped nacelles with open frame ends, aft fins and a recessed flank belt. Deck paint and joints follow the shell. The gun datum stays at `(0, -0.012, 1.068)`; the four glow nodes move with the corrected exhaust faces. Unit raycasts verify each attachment against its actual emissive face.

## Measured geometry and rendering

| Metric | Before | After |
|---|---:|---:|
| Rendered length | 2.0143 | 2.1550 |
| Beam | 1.6000 | 1.0200 |
| Overall depth, including fins | 0.2275 | 0.4649 |
| Beam / rendered length | 0.7943 | 0.4733 |
| Declared gameplay length | 2.16 | 2.16 |
| Full-detail triangles per hull | 496 | 1,752 |
| Reduced-detail triangles per hull | 220 | 1,460 |
| Full-detail mesh/material batches | 5 | 5 |
| 1,000 instanced hulls: full draw calls | 5 | 5 |
| 1,000 instanced hulls: reduced draw calls | 2 | 2 |

The triangle cost is higher, particularly at reduced LOD: 1,000 hulls submit 1.752 million full-detail or 1.460 million reduced triangles. No extra per-vessel draw calls were introduced. Fins, supports and engine frames remain in the structural hull batches. Existing point/culling policy is unchanged. This is a cost accounting and compatibility check, not proof of high FPS on a hardware GPU.

## Visual inspection

All images here are renders of this project's own procedural geometry. The same orthographic camera scale was used before and after, with eight views (six axial views, three-quarter and close). Both repository implementations were rendered independently. The new geometry source is byte-identical between them.

- Plan: broad filled triangles replaced by narrow supports and separate pods; forward fuselage remains distinct from the engine assembly.
- Bottom: structural supports remain readable; underside detail is intentionally sparse because reference coverage is limited.
- Port/starboard: fuller curved body, dark lateral belt, swept aft fins and staggered engine heights; no giant top-mounted glowing cockpit slab.
- Front/rear: paired fins, four distinct pods and four separated rectangular exhausts; attachment raycasts pass.
- Three-quarter/close: inspect the hull collar, deck joints, recessed flank belt, paired bow rails and open pod frames. Fine panel finish, markings and exact game-surface likeness still need a later pass.
- Real Codex battle-view captures cover Earth orbit and deep space; full detail is explicitly selected for the close inspection, and reduced structure is also captured. Sandbox ALL-002 was opened in its six-view inspector without reference-image uploads and without runtime errors. No PASS buttons were set.

Evidence is in the matching Codex PR under `docs/apex/qa/normandy-sr2-20261111/`. The model QA script saves dimensions, hardpoints, exact draw calls, triangle totals, renderer identity and WebGL errors beside its images.

## Verification

- Codex: TypeScript/build; 68 unit files / 411 tests pass. Focused model/instancing/LOD checks pass after detail refinement. Existing ordinary Alliance hull tests remain intact.
- Sandbox: TypeScript/build; 51 Node tests pass. The existing test transpiler now includes the new geometry dependency; nine Alliance/SR-2 tests pass after the final fin-height adjustment.
- Codex browser: existing 320-ship GPU regression and a new 1,000-ship SR-2 battle pass. The latter checks hero/instance coexistence, muzzle, four nodes, five SR-2 batch parts, unchanged simulation time/RNG and zero WebGL errors.
- Sandbox browser: graphics state/camera invariance, fleet controls and six-view interaction were exercised. An initial registry read was interrupted by a development-server reload while editing; its isolated rerun passed. All four selected sandbox browser cases therefore passed (three initially, one on rerun).
- Both model harnesses: six orthographic views, quarter and close views; 1,000 full/reduced instances; no runtime/WebGL errors.
- Renderer: Chromium / ANGLE Vulkan SwiftShader (Subzero), Linux cloud container. **No RTX 5090 or target-PC FPS claim.**

Reproduce against a running Vite dev server:

```sh
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node scripts/normandy-sr2-qa.mjs /tmp/sr2-qa http://127.0.0.1:4173 after
```

The script serves an empty document through Playwright interception, then loads only project modules from the dev server. It does not alter the application's HTML or load any private reference assets.

Simulation, collision data, saves, class IDs, weapons and common materials are unchanged. Shared combat and LOD work is outside this patch. CI, mergeability and deployment must be verified on the eventual PR head before merging. Issue #16 remains unchecked.
