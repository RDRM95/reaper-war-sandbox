import * as THREE from 'three';
import type { BuiltShip } from './types';
import { buildReaperCapital, buildReaperDestroyer } from './reaper';
import { buildPastCycleCruiser, buildPastCycleDreadnought } from './auHumanity';
import { buildAllianceCruiser, buildAllianceDreadnought } from './alliance';

interface Style { hull:number; trim:number; engine:number; lengthM:number; family:'axiom'|'exile'|'compact' }

/**
 * Procedural, original AU silhouettes built from proven hull geometry.
 * No external assets, placeholder sprites or changed combat transforms.
 * All materials are cloned: the canonical ship palettes are untouched.
 */
function styleBuilt(built: BuiltShip, style: Style): BuiltShip {
  const { group } = built;
  group.traverse(o=>{
    const mesh=o as THREE.Mesh;
    if(!mesh.isMesh)return;
    const base=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const mapped=base.map(m=>{
      const clone=m.clone();
      if(clone instanceof THREE.MeshStandardMaterial){
        const luminous=clone.emissiveIntensity>0.8;
        clone.color.setHex(luminous?style.engine:(mesh.name==='plates'||mesh.name==='accent'||mesh.name==='carapace'?style.trim:style.hull));
        if(luminous){clone.emissive.setHex(style.engine);clone.emissiveIntensity=Math.min(2.5,clone.emissiveIntensity);}
        else {clone.metalness=Math.max(.62,clone.metalness);clone.roughness=.4;}
      }
      return clone;
    });
    mesh.material=Array.isArray(mesh.material)?mapped:mapped[0];
  });
  const mat=new THREE.MeshStandardMaterial({color:style.trim,metalness:.76,roughness:.36});
  const shadow=new THREE.MeshStandardMaterial({color:style.hull,metalness:.81,roughness:.43});
  const L=built.lengthUnits;

  // Tapered angular armour instead of box-shaped additions. Shared geometry
  // signatures remain compatible with the GPU instancing/LOD path.
  const wedge=(w:number,h:number,l:number,fore=.46):THREE.BufferGeometry=>{
    const geometry=new THREE.BoxGeometry(w,h,l,1,1,1);
    const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const f=p.getZ(i)>0?fore:.94;
      p.setXY(i,p.getX(i)*f,p.getY(i)*(.78+.22*f));
    }
    p.needsUpdate=true;
    geometry.computeVertexNormals();
    return geometry;
  };
  if(style.family==='exile'){
    // The past-cycle Exiles use raised bridge armour and paired swept rails.
    // These original AU pieces sit on the existing donor ship; main-gun
    // orientation, sensor centre and external hull dimensions remain intact.
    for(const side of [-1,1]){
      const rail=new THREE.Mesh(wedge(L*.048,L*.024,L*.36,.24),mat);
      rail.position.set(side*L*.20,L*.004,-L*.085);
      rail.rotation.y=side*.30;
      rail.name='exile_lance_rail';
      group.add(rail);
      const inset=new THREE.Mesh(wedge(L*.013,L*.014,L*.22,.45),shadow);
      inset.position.set(side*L*.175,L*.029,-L*.09);
      inset.rotation.y=side*.30;
      inset.name='exile_support_rib';
      group.add(inset);
    }
    const spine=new THREE.Mesh(wedge(L*.042,L*.09,L*.36,.42),mat);
    spine.position.set(0,L*.075,-L*.015);
    spine.name='exile_command_keel';
    group.add(spine);
  }else if(style.family==='compact'){
    // Improvised Terminus armour: unmistakably external angular magazines,
    // bolted hardpoints and a reinforced central deck, not huge cuboids.
    for(const side of [-1,1]){
      const pod=new THREE.Mesh(wedge(L*.12,L*.09,L*.24,.57),shadow);
      pod.position.set(side*L*.185,-L*.055,-L*.065);
      pod.name='compact_external_magazine';
      group.add(pod);
      const cover=new THREE.Mesh(wedge(L*.085,L*.016,L*.19,.39),mat);
      cover.position.set(side*L*.185,L*.005,-L*.055);
      cover.name='compact_magazine_armour';
      group.add(cover);
      for(let i=-1;i<=1;i++){
        const rib=new THREE.Mesh(new THREE.BoxGeometry(L*.095,L*.018,L*.006),mat);
        rib.position.set(side*L*.185,-L*.008,-L*.062+i*L*.057);
        rib.name='compact_bolted_rib';
        group.add(rib);
      }
    }
    const plate=new THREE.Mesh(wedge(L*.135,L*.054,L*.30,.44),mat);
    plate.position.set(0,L*.085,0);plate.name='compact_armoured_spine';
    group.add(plate);
  }else{
    // Axiom keeps the real Sovereign-family cuttlefish hull/limbs.
    // Five low scutes subtly identify an older protective command variant.
    // No large secondary ship-like fuselage or unrelated Reaper silhouette.
    for(let i=0;i<5;i++){
      const z=(i-2)*L*.067;
      const scute=new THREE.Mesh(wedge(L*.065,L*.014,L*.061,.52),mat);
      scute.position.set(0,L*(.092+.005*Math.cos(i)),z);
      scute.name='axiom_central_carapace_scute';
      group.add(scute);
    }
    const keel=new THREE.Mesh(wedge(L*.018,L*.028,L*.30,.55),shadow);
    keel.position.set(0,L*.097,-L*.028);
    keel.name='axiom_dorsal_keel';
    group.add(keel);
  }
  // Catalogue length is authoritative for simulation placement. Compute
  // the visual scale from the real donor template rather than an approximate
  // multiplier (previously some silhouettes mismatched their metre metadata).
  // Donor templates sometimes have a few percent of extra geometry beyond
  // their nominal lengthUnits. Measure *actual* visible bounds to keep class
  // silhouette size consistent with the simulation's metre datum.
  const actualLength=new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).z;
  const scale = (style.lengthM / 100) / Math.max(1e-6,actualLength);
  group.scale.multiplyScalar(scale);
  return { ...built, lengthUnits: style.lengthM / 100,
    glowColor:style.engine,
    engineNodes:built.engineNodes.map(v=>v.clone().multiplyScalar(scale)),
    muzzle:built.muzzle?.clone().multiplyScalar(scale) };
}

export const buildAxiomAncient=():BuiltShip=>styleBuilt(buildReaperCapital(),
  {hull:0x8d9fa8,trim:0xc5d0d5,engine:0x66e0ee,lengthM:4200,family:'axiom'});
export const buildAxiomWarden=():BuiltShip=>styleBuilt(buildReaperDestroyer(),
  {hull:0x70828f,trim:0xa9d1d5,engine:0x70e9e0,lengthM:280,family:'axiom'});
export const buildExileArk=():BuiltShip=>styleBuilt(buildPastCycleDreadnought(),
  {hull:0x46546a,trim:0xa095bb,engine:0xb1a2ff,lengthM:2600,family:'exile'});
export const buildExileRaider=():BuiltShip=>styleBuilt(buildPastCycleCruiser(),
  {hull:0x526c78,trim:0xb7aecf,engine:0xaaa8ff,lengthM:730,family:'exile'});
export const buildCompactSiege=():BuiltShip=>styleBuilt(buildAllianceDreadnought(),
  {hull:0x715643,trim:0xbf8751,engine:0xffa25e,lengthM:1120,family:'compact'});
export const buildCompactGunship=():BuiltShip=>styleBuilt(buildAllianceCruiser(),
  {hull:0x645348,trim:0xc29259,engine:0xffb06c,lengthM:260,family:'compact'});
