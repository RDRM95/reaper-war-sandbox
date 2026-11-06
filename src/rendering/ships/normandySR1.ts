import * as THREE from 'three';
import { assemble, newParts } from './alliance';
import { at, taperedBox, zCylinder } from '../geometry';
import type { BuiltShip } from './types';

/**
 * SSV Normandy SR-1 — original procedural visual reconstruction candidate.
 *
 * Reference: ALL-001 (ME1 silhouette): a long slim fuselage and pointed nose,
 * triangular swept roots, and *separate* rear outboard engine nacelles.
 * +Z is the bow, +Y is dorsal. This is NOT an extracted BioWare model.
 *
 * 1.70 render units is a GAMEPLAY / preview size assumption, not a claim
 * of a canonical 170 m SR-1 datum (the supplied pack lists that as unknown).
 */
const LENGTH = 1.70;
const GREY = 0xbcc7ce;
const DARK = 0x252e38;
const RED = 0x8d3640;

type Outline = readonly [number,number][];
function extrudePlan(points: Outline, halfThickness: number): THREE.BufferGeometry {
  // Polygon in XZ plane, constant thickness in Y. Each face has flat normals.
  const p: number[] = [];
  const put = (a:number[], b:number[], c:number[]) => p.push(...a,...b,...c);
  for (let i=1;i<points.length-1;i++) {
    const c=points[0],a=points[i],b=points[i+1];
    put([c[0],halfThickness,c[1]],[a[0],halfThickness,a[1]],[b[0],halfThickness,b[1]]);
    put([b[0],-halfThickness,b[1]],[a[0],-halfThickness,a[1]],[c[0],-halfThickness,c[1]]);
  }
  for (let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    put([a[0],halfThickness,a[1]],[b[0],halfThickness,b[1]],[a[0],-halfThickness,a[1]]);
    put([b[0],halfThickness,b[1]],[b[0],-halfThickness,b[1]],[a[0],-halfThickness,a[1]]);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geometry.computeVertexNormals();
  return geometry;
}
function fuselage(): THREE.BufferGeometry {
  const rings=[
    [-.84,.070,.046],
    [-.62,.105,.063],
    [-.30,.120,.077],
    [-.02,.108,.074],
    [ .30,.086,.055],
    [ .56,.049,.035],
    [ .78,.009,.012],
    [ .85,.001,.004],
  ];
  const vertices:number[]=[];
  const facets=12;
  const put=(a:number[],b:number[],c:number[])=>vertices.push(...a,...b,...c);
  const ring=(r:number,i:number)=>{
    const [z,rx,ry]=rings[r];
    const angle=i*Math.PI*2/facets;
    return [Math.cos(angle)*rx,Math.sin(angle)*ry+0.018,z];
  };
  for(let r=0;r<rings.length-1;r++)for(let i=0;i<facets;i++){
    const j=(i+1)%facets;
    put(ring(r,i),ring(r+1,i),ring(r+1,j));
    put(ring(r,i),ring(r+1,j),ring(r,j));
  }
  // End caps.
  for(let i=0;i<facets;i++){
    put([0,.018,rings[0][0]],ring(0,(i+1)%facets),ring(0,i));
    put([0,.018,rings[rings.length-1][0]],ring(rings.length-1,i),ring(rings.length-1,(i+1)%facets));
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.computeVertexNormals();
  return geometry;
}

export function buildNormandySR1(): BuiltShip {
  const parts=newParts();
  parts.hull.push(fuselage());
  // Separate, recessed long cockpit and broad upper dorsal fairing.
  parts.hull.push(at(taperedBox(.14,.043,.69,.46,.95,{frontHeight:.40}),0,.063,.25));
  parts.hullDark.push(at(taperedBox(.08,.022,.17,.40,.9),0,.095,.63));
  parts.hullDark.push(at(taperedBox(.082,.045,.63,.77,.90),0,-.051,-.13));
  // Sweep: distinct delta roots, NOT generic flat aircraft wings.
  for(const side of [-1,1]){
    const wing:Outline=[
      [side*.072,.22],
      [side*.16,-.04],
      [side*.32,-.22],
      [side*.41,-.54],
      [side*.32,-.67],
      [side*.13,-.45],
    ];
    parts.hull.push(extrudePlan(wing,.024));
    // Raised structural wing-root truss and visible longitudinal keel.
    const truss=taperedBox(.075,.035,.75,.6,.9);
    truss.rotateY(-side*.17);
    parts.hull.push(at(truss,side*.17,.026,-.25));
    // The SR-1's recognisable parallel outboard engine pods.
    for(const offset of [0,.083]){
      const x=side*(.305+offset);
      parts.hullDark.push(at(taperedBox(.075,.078,.62,.82,.96),x,-.018,-.37));
      parts.hull.push(at(taperedBox(.075,.026,.27,.65,.98),x,.040,-.38));
      parts.hullDark.push(at(zCylinder(.037,.036,.17,10,true),x,-.018,-.72));
      parts.engine.push(at(zCylinder(.030,.030,.028,10),x,-.018,-.81));
      parts.accent.push(at(new THREE.BoxGeometry(.008,.012,.28),x+side*.040,.005,-.34));
    }
    // Short ventral wing-root pods unique to the stealth frigate.
    parts.hullDark.push(at(taperedBox(.035,.033,.36,.55,.75),side*.155,-.065,-.13));
  }
  // Forward spinal gun casing terminates at actual nose.
  parts.hullDark.push(at(taperedBox(.048,.026,.56,.35,.90),0,-.045,.47));
  // Restrained SR-1 stripe, integrated instead of emissive hull paint.
  parts.accent.push(at(new THREE.BoxGeometry(.008,.008,.55),.083,.063,.09));
  const nodes:THREE.Vector3[]=[];
  for(const side of [-1,1])for(const offset of [0,.083])
    nodes.push(new THREE.Vector3(side*(.305+offset),-.018,-.824));
  const built=assemble(parts,'alliance',nodes,LENGTH,new THREE.Vector3(0,-.048,.82));
  const stripe=new THREE.Mesh(
    new THREE.BoxGeometry(.008,.008,.47),
    new THREE.MeshStandardMaterial({color:RED,metalness:.28,roughness:.53})
  );
  stripe.position.set(-.087,.063,.08);
  stripe.name='sr1-stripe';
  built.group.add(stripe);
  // Non-emissive structural rails rather than brilliant neon panels.
  const bowDetail=new THREE.Mesh(new THREE.BoxGeometry(.02,.008,.23),
    new THREE.MeshStandardMaterial({color:GREY,metalness:.63,roughness:.38}));
  bowDetail.position.set(0,.094,.31);
  bowDetail.name='sr1-command-fairing';
  built.group.add(bowDetail);
  // Geometry includes 4 physically located nozzle nodes and a bow spinal mount.
  built.group.name='SR1 procedural candidate — visual approval required';
  return built;
}
