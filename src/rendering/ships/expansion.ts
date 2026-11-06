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
        clone.color.setHex(luminous?style.engine:(mesh.name==='plates'||mesh.name==='accent'?style.trim:style.hull));
        if(luminous){clone.emissive.setHex(style.engine);clone.emissiveIntensity=Math.min(2.5,clone.emissiveIntensity);}
        else {clone.metalness=Math.max(.62,clone.metalness);clone.roughness=.4;}
      }
      return clone;
    });
    mesh.material=Array.isArray(mesh.material)?mapped:mapped[0];
  });
  const mat=new THREE.MeshStandardMaterial({color:style.trim,metalness:.78,roughness:.3});
  const L=built.lengthUnits;
  if(style.family==='exile'){
    // Swept paired lance vanes and a raised command keel: ark silhouette.
    for(const side of [-1,1]){
      const vane=new THREE.Mesh(new THREE.BoxGeometry(L*.05,L*.04,L*.36),mat);
      vane.position.set(side*L*.21,0,-L*.08);
      vane.rotation.y=side*.36;
      group.add(vane);
    }
    const spine=new THREE.Mesh(new THREE.BoxGeometry(L*.04,L*.11,L*.45),mat);
    spine.position.y=L*.08;group.add(spine);
  }else if(style.family==='compact'){
    // Boxy external magazine pods and reinforced dorsal armour.
    for(const side of [-1,1]){
      const pod=new THREE.Mesh(new THREE.BoxGeometry(L*.13,L*.10,L*.23),mat);
      pod.position.set(side*L*.19,-L*.055,-L*.06);group.add(pod);
    }
    const plate=new THREE.Mesh(new THREE.BoxGeometry(L*.15,L*.07,L*.38),mat);
    plate.position.set(0,L*.11,0);group.add(plate);
  }else{
    // Axiom's visible protective spine and calm cyan seams, contrasting
    // the dark-red offensive Sovereign-family Reapers.
    const spine=new THREE.Mesh(new THREE.BoxGeometry(L*.04,L*.12,L*.34),mat);
    spine.position.set(0,L*.095,-L*.035);group.add(spine);
  }
  // Catalogue length is authoritative for simulation placement. Compute
  // the visual scale from the real donor template rather than an approximate
  // multiplier (previously some silhouettes mismatched their metre metadata).
  const scale = style.lengthM / (100 * built.lengthUnits);
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
