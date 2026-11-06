import source from './ship_registry.json';
import { SHIP_CLASSES } from '@/data/ships';
import { hasModel } from '@/rendering/ships';

/** Exact provenance flags from the user's reference pack are immutable.
 * A matching in-game class is not proof of a validated game-authentic mesh.
 */
export type SourceVisibility='on_screen'|'concept_only'|'text_only'|'apex_original';
export type GeometryStatus=SourceVisibility;
export type ReferencePriority='P0'|'P1'|'P2'|'APEX';
export type Approval='not_reviewed'|'needs_capture'|'pass'|'fail';
export interface ShipReference {
  readonly id:string;
  readonly name:string;
  readonly source_visibility:string;
  readonly geometry_status:GeometryStatus;
  readonly build_priority:ReferencePriority;
  readonly length_m:number|null;
  readonly primary_source_ids:readonly string[];
  readonly apex_original:boolean;
}
export interface ShipReferenceMatch {
  readonly reference:ShipReference;
  readonly classId:string|null;
  readonly modelAvailable:boolean;
  readonly actualGameMesh:false;
  readonly approval:Exclude<Approval,'pass'>;
  readonly source: 'user-reference-pack-v1';
  readonly geometrySource:'procedural_reconstruction'|'not_modelled';
  readonly notes:string;
}

// Explicit, reviewable associations. No automatic fuzzy matches: they risk
// implying that a procedural cruiser is a faithful Normandy or Sovereign mesh.
export const REFERENCE_CLASS_MAP:Readonly<Record<string,string>>=Object.freeze({
  'ALL-002':'alliance_frigate_thanix',
  'ALL-003':'alliance_cruiser',
  'ALL-004':'alliance_dreadnought',
  'ALL-005':'alliance_fighter',
  'ALL-007':'alliance_carrier',
  'ALL-A01':'alliance_omaha',
  'CER-001':'cerberus_cruiser',
  'CER-003':'cerberus_dreadnought',
  'TUR-001':'turian_cruiser',
  'TUR-002':'turian_dreadnought',
  'ASA-001':'destiny_ascension',
  'ASA-002':'asari_cruiser',
  'QUR-001':'quarian_cruiser',
  'QUR-002':'quarian_liveship',
  'GET-001':'geth_cruiser',
  'GET-002':'geth_dreadnought',
  'GET-003':'geth_fighter',
  'REP-001':'reaper_capital',
  'REP-002':'harbinger',
  'REP-003':'reaper_destroyer',
  'REP-A01':'axiom_ancient',
  'TER-A01':'compact_siege',
});

const frozenRefs=source.ships.map(record=>{
  const refs=Object.freeze([...record.primary_source_ids]);
  return Object.freeze({...record,primary_source_ids:refs}) as ShipReference;
});
// A frozen Map still permits .set() at runtime. Keep the Map private and
// expose only read methods, so provenance cannot be overwritten by callers.
const referenceIndex=new Map(frozenRefs.map(r=>[r.id,r] as const));
export const ShipReferenceRegistry=Object.freeze({
  get:(id:string):ShipReference|undefined=>referenceIndex.get(id),
  has:(id:string):boolean=>referenceIndex.has(id),
  values:():IterableIterator<ShipReference>=>referenceIndex.values(),
  entries:():IterableIterator<readonly [string,ShipReference]>=>referenceIndex.entries(),
  get size():number{return referenceIndex.size;}
});

export function auditShipReferences():ShipReferenceMatch[]{
  return frozenRefs.map(reference=>{
    const candidate=REFERENCE_CLASS_MAP[reference.id]??null;
    const available=!!candidate&&!!SHIP_CLASSES[candidate]&&hasModel(candidate);
    return {
      reference,classId:available?candidate:null,modelAvailable:available,
      actualGameMesh:false as const,
      approval:available?'not_reviewed' as const:'needs_capture' as const,
      source:'user-reference-pack-v1' as const,
      geometrySource:available?'procedural_reconstruction' as const:'not_modelled' as const,
      notes:available?'Working procedural model; silhouette and scale NOT visually approved.':
        'Missing dedicated reference-matched model; retain existing game content.'
    };
  });
}

/** Dimension data are reference assertions, not instructions to rescale a
 * working model. Null means that the pack does not support a precise datum. */
export function getReferenceForClass(classId:string):ShipReference|undefined{
  const id=Object.keys(REFERENCE_CLASS_MAP).find(key=>REFERENCE_CLASS_MAP[key]===classId);
  return id?ShipReferenceRegistry.get(id):undefined;
}
