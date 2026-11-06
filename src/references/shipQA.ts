import { SHIP_CLASSES } from '@/data/ships';
import { getShipTemplate, hasModel } from '@/rendering/ships';
import { REDUCED_FACTOR, POINT_FACTOR, FIGHTER_REDUCED_DISTANCE, FIGHTER_POINT_DISTANCE } from '@/rendering/lod';
import { auditShipReferences, REFERENCE_CLASS_MAP, type ShipReference } from './ShipReferenceRegistry';

/** P0 visual evidence targets transcribed from the supplied reference pack.
 * These are criteria, not evidence that the existing procedural mesh passes.
 */
export const P0_SILHOUETTES: Readonly<Record<string,{silhouette:string;visualTest:string}>>=Object.freeze({
  'ALL-001': {silhouette:'Narrow wedge fuselage, two external wing/engine pods, pointed bow.',visualTest:'ME1 engine pods and root joints; not generic winglets.'},
  'ALL-002': {silhouette:'Arrowhead body, curved wing nacelles, extended needle bow.',visualTest:'SR-2 geometry remains consistent across Cerberus and Alliance liveries.'},
  'ALL-003': {silhouette:'Forward-projecting body, twin lateral aft prongs, blue-white sculpted spine.',visualTest:'Bow, shoulders, engine block, dorsal ridges match ME3 shots.'},
  'ALL-004': {silhouette:'Long weapon spine, forked forebody, massive axial mount and stern engine banks.',visualTest:'Compare against game scenes, not an unverified fan diagram.'},
  'CER-001': {silhouette:'Distinct pearl-grey/black cruiser, amber accents and twin-prong profile.',visualTest:'Must match Cerberus model; Alliance paint swap alone is insufficient.'},
  'TUR-001': {silhouette:'Beaked angular mass, feathered layered armour, swept fins.',visualTest:'Distinctive turian beak and wing silhouette from multiple angles.'},
  'ASA-001': {silhouette:'Huge rounded disc/fan structure with tapered flowing lower limbs.',visualTest:'Broad canopy; reject needle-shaped substitute.'},
  'QUR-001': {silhouette:'Full annular ring crossing long industrial hull.',visualTest:'Verify ring thickness, orientation and hull crossing.'},
  'GET-001': {silhouette:'Smooth machine-organic fore shell and narrow segmented aft.',visualTest:'Verify cruiser rather than transporter hull.'},
  'GET-002': {silhouette:'Bulbous armoured machine hull, indented nose, dorsal curves and purple glow.',visualTest:'Preserve the Rannoch dreadnought modifications.'},
  'REP-001': {silhouette:'Two-kilometre cephalopod carapace, multi-jointed limbs, axial emitter.',visualTest:'Long body, dark metal and subtle mechanical articulation.'},
  'REP-002': {silhouette:'Capital Reaper with distinct head and carapace.',visualTest:'Harbinger identifiable at three-quarter angle.'},
  'REP-003': {silhouette:'160-metre four-legged destroyer, folding facial plates and central forward beam.',visualTest:'Not a scaled-down Sovereign; check independent leg and facial joint rig.'}
});
export interface ShipQAMetadata {
  registryId:string;classId:string|null;name:string;
  sourceVisibility:ShipReference['source_visibility'];geometryStatus:ShipReference['geometry_status'];
  priority:string;modelStatus:'missing'|'procedural_unverified';
  referenceLengthM:number|null;simulationLengthM:number|null;
  lengthMismatchM:number|null;
  hardpoints:Array<{weaponId:string;offsetM:[number,number,number];facingDegrees:number;mounts:number}>;
  thrusters:number|null;damageZones:'not_authored';animationRig:'reaper_joints'|'static';
  lod:{reduced:number|null;point:number|null;units:'render_units'};
  silhouetteTarget?:string;approval:'not_reviewed';
}
/** Read-only inspection: never scales a hull, fabricates damage zones, or
 * treats procedural renderer data as a valid canonical dimension.
 */
export function buildShipQAAudit():ShipQAMetadata[]{
  return auditShipReferences().map(m=>{
    const id=m.classId;const cls=id?SHIP_CLASSES[id]:undefined;
    const model=cls&&hasModel(cls.id)?getShipTemplate(cls.id):undefined;
    const long=cls?.lengthM.value??null;
    const reference=m.reference.length_m;
    const small=cls?.role==='fighter';
    return {
      registryId:m.reference.id,classId:id,name:m.reference.name,
      sourceVisibility:m.reference.source_visibility,
      geometryStatus:m.reference.geometry_status,
      priority:m.reference.build_priority,
      modelStatus:model?'procedural_unverified':'missing',
      referenceLengthM:reference,simulationLengthM:long,
      lengthMismatchM:reference!==null&&long!==null?Math.round((long-reference)*100)/100:null,
      hardpoints:cls?.hardpoints.map(h=>({weaponId:h.weaponId,offsetM:[...h.offset],facingDegrees:h.facing,mounts:h.count}))??[],
      thrusters:model?.engineNodes.length??null,damageZones:'not_authored',
      animationRig:cls&&(cls.faction==='reaper'||String(cls.faction)==='axiom_guard')?'reaper_joints':'static',
      lod:{reduced:model?(small?FIGHTER_REDUCED_DISTANCE:model.lengthUnits*REDUCED_FACTOR):null,
        point:model?(small?FIGHTER_POINT_DISTANCE:model.lengthUnits*POINT_FACTOR):null,units:'render_units'},
      silhouetteTarget:P0_SILHOUETTES[m.reference.id]?.visualTest,
      approval:'not_reviewed'
    };
  });
}
