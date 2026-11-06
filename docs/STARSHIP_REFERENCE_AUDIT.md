# Mass Effect Starship Reference Pack v1 — integration report
Source: user-supplied `Mass_Effect_Starship_Reference_Pack_v1(1).zip` and `CODEX_BUILD_BRIEF(1).md`, dated 6 November 2026.

## Scope imported
- **43 reference entries** and source visibility / geometry flags; 13 P0, 6 P1, 17 P2 and 7 APEX.
- The compact index preserves registry ID, visible source status, priority, known length datum (or null), source IDs and Apex-original status. **This is a compact import, not a complete reproduction of the ZIP**; the original pack remains the authority for detailed modelling notes, full source list, capture protocol and design bible.
- **15 labelled source-page links** (no copied third-party images or meshes).
- A read-only QA inventory in `src/references/shipQA.ts`, and a six-view geometric comparison overlay.
- No changes to authoritative simulation length, weapon damage, hit position, speed, collision, fleet state or existing procedural models. All geometry approvals remain **NOT REVIEWED**.

## P0 matching inventory
| Registry | Evidence target | Simulator class association | Current approval |
|---|---|---|---|
| ALL-001 | Normandy SR-1 | **Missing dedicated SR-1 hull** | MISSING |
| ALL-002 | Normandy SR-2, Alliance | alliance_frigate_thanix (approximation) | NOT REVIEWED |
| ALL-003 | ME3 Alliance cruiser | alliance_cruiser (procedural) | NOT REVIEWED |
| ALL-004 | ME3 Alliance dreadnought | alliance_dreadnought (procedural) | NOT REVIEWED |
| CER-001 | Cerberus cruiser | cerberus_cruiser (procedural) | NOT REVIEWED |
| TUR-001 | Turian cruiser | turian_cruiser (procedural) | NOT REVIEWED |
| ASA-001 | Destiny Ascension | destiny_ascension (procedural) | NOT REVIEWED |
| QUR-001 | Quarian ring cruiser | quarian_cruiser (procedural) | NOT REVIEWED |
| GET-001 | Geth cruiser | geth_cruiser (procedural) | NOT REVIEWED |
| GET-002 | Geth Rannoch dreadnought | geth_dreadnought (procedural) | NOT REVIEWED |
| REP-001 | Sovereign-class Reaper | reaper_capital (procedural) | NOT REVIEWED |
| REP-002 | Harbinger | harbinger (procedural) | NOT REVIEWED |
| REP-003 | Reaper destroyer | reaper_destroyer (procedural) | NOT REVIEWED |

Association means the current model is used as a starting inspection target, **not** that its silhouette matches the game. The registry has 21 entries with no direct class association in the shared mapping. The full QA function independently checks actual installed model availability: different builds may legitimately have different working classes.

## Verified geometry data, not sim instructions
The source pack lists **2,000 m for Sovereign-class capital Reapers and 160 m for destroyers**, also 196 m for SR-2, 707 m Alliance ME3 cruiser, 700 m Cerberus cruiser, 500 m turian cruiser, 643 m quarian ring cruiser, 700 m geth cruiser, 1,190 m geth dreadnought. Other lengths are **unknown**, not to be invented. Render scaling is not silently changed.

## Six-view validation
Use **SHIP REFERENCES · 6 VIEWS** inside the game. Select a ship; top, bottom, port, starboard, bow and stern orthographic renders use `+Z` forward, `+Y` up. Upload your own screenshot for each angle, adjust opacity, enter capture notes and mark FAIL or PASS. PASS is unavailable until a reference screenshot is selected. The chosen status is a user review, not official provenance; local screenshots are not uploaded or distributed. **EXPORT QA JSON** writes assessment results without image data.

## Implementation still required
1. Replace the missing SR-1 hull with a faithful, evidence-backed geometry model.
2. Build proper P0 silhouette checks against all six source captures and optional 3/4 perspectives, with image geometry metrics (human two-second recognition check is still manual).
3. Review and approve replacement meshes before swapping the procedural working hulls, using correct metre datums and unchanged weapon hardpoints.
4. Create dedicated Collector cruiser and remaining P1/P2 ship models only when appropriate reference and licensing exist.
5. Build the 30-cruiser gunnery synchronization and 1,000+ ship 4K hardware benchmarks separately; their performance **has not been established by this reference import**.
6. Never treat authored Apex originals, fan ortho renders, concept-only designs or text-only ship names as shipped, official 3D meshes.

## Asset policy
The reference pack links to third-party material; no external images or official game meshes are bundled. Only use legal screenshots and appropriately licensed user-supplied 3D models. Keep `source_visibility` and `geometry_status` frozen and separate from local inspector review notes.
