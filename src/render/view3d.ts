import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Battle} from '../sim/battle';
import type {Ship, ShipSpec, WeaponKind} from '../sim/types';
import {RNG} from '../sim/rng';
import {silhouetteProfile} from './silhouettes';
interface DetailInstances {parts:THREE.InstancedMesh[];scale:number;}
interface Batch {hull:THREE.InstancedMesh;glow:THREE.InstancedMesh;ships:Ship[];custom?:DetailInstances;}
const WEAPON_COLOR:Record<WeaponKind,number>={mac:0x6abbef,beam:0xf64863,missile:0xffbb72,hades:0xff9b4c,nova:0xfff2c0,point:0x91deff};
const COLOR={alliance:0x749db5,cerberus:0x6b7788,reaper:0x382a35};
function outline(points:number[][]){const s=new THREE.Shape();s.moveTo(points[0][0],points[0][1]);for(const p of points.slice(1))s.lineTo(p[0],p[1]);s.closePath();return s;}
function extrude(s:THREE.Shape,depth=.17){const g=new THREE.ExtrudeGeometry(s,{steps:1,depth,bevelEnabled:true,bevelThickness:.045,bevelSize:.06,bevelSegments:1,curveSegments:8});g.translate(0,0,-depth/2);return g;}
function shapeFor(spec:ShipSpec){
  const p=silhouetteProfile(spec.silhouette);
  const shapes=[p.main,...p.appendages,p.spine];
  const geometry=shapes.map((path,i)=>extrude(outline(path),i===0?.28:i===shapes.length-1?.36:.20));
  const mesh=mergeGeometries(geometry,false);geometry.forEach(g=>g.dispose());
  if(!mesh)throw Error('Unable to construct ship geometry');
  mesh.computeVertexNormals();return mesh;
}
export class View3D {
  canvas:HTMLCanvasElement; scene=new THREE.Scene(); camera:THREE.PerspectiveCamera;
  renderer:THREE.WebGLRenderer;controls:OrbitControls;
  private battleship:Battle|null=null;private batches:Batch[]=[];
  private effects=new Map<WeaponKind,{line:THREE.LineSegments;pos:Float32Array}>();
  private burst:THREE.InstancedMesh;private ray=new THREE.Raycaster();private privatePointer=new THREE.Vector2();
  private dummy=new THREE.Object3D();private clickAt:{x:number;y:number}|null=null;
  selected:number|null=null;private followId:number|null=null;
  onSelect:(id:number|null)=>void=()=>{};
  private customStatus:(txt:string)=>void=()=>{};
  constructor(container:HTMLElement,onModelStatus?:(msg:string)=>void){
    if(onModelStatus)this.customStatus=onModelStatus;
    this.camera=new THREE.PerspectiveCamera(47,1,.5,8000);this.camera.position.set(310,-990,1120);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));this.renderer.setClearColor(0x030914,1);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
    this.canvas=this.renderer.domElement;this.canvas.className='battle-canvas';this.canvas.setAttribute('aria-label','3D cinematic orbit camera');container.append(this.canvas);
    this.controls=new OrbitControls(this.camera,this.canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.085;this.controls.minDistance=75;this.controls.maxDistance=4500;this.controls.maxPolarAngle=Math.PI*.88;this.controls.target.set(0,0,0);this.controls.update();
    this.scene.add(new THREE.HemisphereLight(0xa6ceff,0x1b2432,2));
    const sun=new THREE.DirectionalLight(0xd7eaff,2.3);sun.position.set(-280,-400,840);this.scene.add(sun);
    const red=new THREE.DirectionalLight(0xbf4c65,1.1);red.position.set(650,220,180);this.scene.add(red);
    this.addStars();
    for(const kind of Object.keys(WEAPON_COLOR) as WeaponKind[]){const pos=new Float32Array(6*800);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));geo.setDrawRange(0,0);
      const line=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:WEAPON_COLOR[kind],transparent:true,opacity:kind==='beam'?.84:.97,blending:THREE.AdditiveBlending,depthWrite:false}));line.frustumCulled=false;this.scene.add(line);this.effects.set(kind,{line,pos});}
    this.burst=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,8),new THREE.MeshBasicMaterial({color:0xffa465,transparent:true,opacity:.74,blending:THREE.AdditiveBlending,depthWrite:false}),300);
    this.burst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.burst.count=0;this.burst.frustumCulled=false;this.scene.add(this.burst);
    this.canvas.addEventListener('pointerdown',e=>{this.clickAt={x:e.clientX,y:e.clientY};});
    this.canvas.addEventListener('pointerup',e=>{if(this.clickAt&&Math.hypot(e.clientX-this.clickAt.x,e.clientY-this.clickAt.y)<5)this.pick(e);this.clickAt=null;});
    this.resize();
  }
  private addStars(){const rng=new RNG(2026),positions=new Float32Array(7000*3);
    for(let i=0;i<7000;i++){const theta=rng.next()*Math.PI*2;const u=rng.next()*2-1;const radius=1900+rng.between(-250,1800);const r=Math.sqrt(1-u*u);positions[i*3]=radius*r*Math.cos(theta);positions[i*3+1]=radius*r*Math.sin(theta);positions[i*3+2]=radius*u;}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));
    this.scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xb4d6fa,size:2.3,sizeAttenuation:true,transparent:true,opacity:.88})));
    const ambient=new THREE.Mesh(new THREE.SphereGeometry(195,32,16),new THREE.MeshBasicMaterial({color:0x13243b,transparent:true,opacity:.10,depthWrite:false}));
    ambient.position.set(-250,1200,-800);this.scene.add(ambient);
  }
  setBattle(sim:Battle){this.clearBattle();this.battleship=sim;const groups=new Map<string,Ship[]>();
    for(const s of sim.ships){const arr=groups.get(s.spec.id)||[];arr.push(s);groups.set(s.spec.id,arr);}
    for(const ships of groups.values()){
      const spec=ships[0].spec,geometry=shapeFor(spec),mat=new THREE.MeshStandardMaterial({color:COLOR[spec.faction],metalness:.62,roughness:.38,side:THREE.DoubleSide,flatShading:false});
      const hull=new THREE.InstancedMesh(geometry,mat,ships.length);hull.instanceMatrix.setUsage(THREE.DynamicDrawUsage);hull.frustumCulled=false;
      const lightGeo=new THREE.SphereGeometry(1,6,5),lightMat=new THREE.MeshBasicMaterial({color:spec.faction==='reaper'?0xf73549:0x56b9ff,blending:THREE.AdditiveBlending,transparent:true,opacity:.94,depthWrite:false});
      const glow=new THREE.InstancedMesh(lightGeo,lightMat,ships.length);glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);glow.frustumCulled=false;
      this.scene.add(hull,glow);this.batches.push({hull,glow,ships});
    }
    this.controls.target.set(0,0,0);this.camera.position.set(310,-990,1120);this.controls.update();this.followId=null;this.selected=null;
    void this.loadCustomModels();
  }
  private clearBattle(){
    for(const b of this.batches){
      this.scene.remove(b.hull,b.glow);
      b.hull.geometry.dispose();(b.hull.material as THREE.Material).dispose();
      b.glow.geometry.dispose();(b.glow.material as THREE.Material).dispose();
      if(b.custom)for(const part of b.custom.parts){
        this.scene.remove(part);part.geometry.dispose();
        const materials=Array.isArray(part.material)?part.material:[part.material];
        for(const material of materials)material.dispose();
      }
    }
    this.batches=[];
  }
  private async loadCustomModels(){
    let manifest:Record<string,string>={};
    try{const res=await fetch(`${import.meta.env.BASE_URL}assets/ships/models.json`);if(res.ok)manifest=await res.json() as Record<string,string>;}catch{return;}
    const loader=new GLTFLoader();
    const cache=new Map<string,Promise<THREE.Group>>();
    for(const batch of this.batches){
      const file=manifest[batch.ships[0].spec.id];if(!file)continue;
      try{
        let request=cache.get(file);
        if(!request){request=loader.loadAsync(`${import.meta.env.BASE_URL}assets/ships/${file}`).then(gltf=>gltf.scene);cache.set(file,request);}
        const model=await request;
        if(!this.batches.includes(batch))return;
        model.updateMatrixWorld(true);
        const bounds=new THREE.Box3().setFromObject(model);
        const length=bounds.getSize(new THREE.Vector3()).length()||1;
        const parts:THREE.InstancedMesh[]=[];
        model.traverse(object=>{
          if(!(object instanceof THREE.Mesh)||!object.geometry)return;
          // Bake the GLB's node transforms into geometry, then instance that geometry.
          // Two draw calls per ship class instead of cloning dozens of models per ship.
          const geo=(object.geometry as THREE.BufferGeometry).clone().applyMatrix4(object.matrixWorld);
          const original=object.material;
          const mat=Array.isArray(original)?original.map(m=>m.clone()):original.clone();
          const part=new THREE.InstancedMesh(geo,mat,batch.ships.length);
          part.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          part.frustumCulled=false;
          part.userData.shipClass=batch.ships[0].spec.id;
          this.scene.add(part);parts.push(part);
        });
        if(!parts.length)throw Error('No drawable meshes in GLB');
        batch.custom={parts,scale:2.7/length};
        batch.hull.visible=false;batch.glow.visible=false;
        this.customStatus(`Detailed models active: ${batch.ships[0].spec.name} (${batch.ships.length} instanced)`);
      }catch{
        this.customStatus(`Could not load ${file}; using procedural fallback.`);
      }
    }
  }
  private pick(e:PointerEvent){if(!this.battleship)return;const rect=this.canvas.getBoundingClientRect();this.privatePointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    this.ray.setFromCamera(this.privatePointer,this.camera);
    let id:number|null=null;let distance=Infinity;
    for(const batch of this.batches){
      if(batch.custom){
        for(const part of batch.custom.parts){
          const hits=this.ray.intersectObject(part);
          if(hits.length&&hits[0].instanceId!==undefined&&hits[0].distance<distance){
            id=batch.ships[hits[0].instanceId].id;distance=hits[0].distance;
          }
        }
      } else {
        const hits=this.ray.intersectObject(batch.hull);
        if(hits.length&&hits[0].instanceId!==undefined&&hits[0].distance<distance){
          id=batch.ships[hits[0].instanceId].id;distance=hits[0].distance;
        }
      }
    }
    this.selected=id;this.onSelect(id);
  }
  setSelected(id:number|null){this.selected=id;}
  follow(id:number|null){this.followId=id;}
  resize(){const rect=this.canvas.parentElement?.getBoundingClientRect();if(!rect)return;
    const w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height));if(w===this.renderer.domElement.width&&h===this.renderer.domElement.height)return;
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  draw(battle:Battle){this.battleship=battle;this.resize();
    for(const batch of this.batches){
      for(let i=0;i<batch.ships.length;i++){
        const ship=batch.ships[i],size=ship.alive?ship.spec.size:0.0001;
        if(batch.custom){
          this.dummy.position.set(ship.x,ship.y,ship.z);
          this.dummy.rotation.set(0,0,ship.heading);
          this.dummy.scale.setScalar(size*batch.custom.scale);
          this.dummy.updateMatrix();
          for(const part of batch.custom.parts)part.setMatrixAt(i,this.dummy.matrix);
        }else{
          this.dummy.position.set(ship.x,ship.y,ship.z);
          this.dummy.rotation.set(0,0,ship.heading);
          this.dummy.scale.set(size,size,size*.7);
          this.dummy.updateMatrix();batch.hull.setMatrixAt(i,this.dummy.matrix);
          const front=ship.spec.faction==='reaper'?.75:-1.2;
          this.dummy.position.set(ship.x+Math.cos(ship.heading)*ship.spec.size*front,ship.y+Math.sin(ship.heading)*ship.spec.size*front,ship.z+.12*ship.spec.size);
          this.dummy.rotation.set(0,0,0);
          this.dummy.scale.setScalar(size*(ship.spec.faction==='reaper'?.19:.14));
          this.dummy.updateMatrix();batch.glow.setMatrixAt(i,this.dummy.matrix);
        }
      }
      if(batch.custom)for(const part of batch.custom.parts)part.instanceMatrix.needsUpdate=true;
      else {batch.hull.instanceMatrix.needsUpdate=true;batch.glow.instanceMatrix.needsUpdate=true;}
    }
    for(const [kind,fx] of this.effects){let count=0;for(const s of battle.shots){if(s.kind!==kind||count>=800)continue;
      const f=Math.min(1,s.age/s.duration),a=kind==='beam'?Math.max(0,f-.85):Math.max(0,f-.24),b=kind==='beam'?1:Math.min(1,f+.05);
      const n=count*6;fx.pos[n]=s.sx+(s.ex-s.sx)*a;fx.pos[n+1]=s.sy+(s.ey-s.sy)*a;fx.pos[n+2]=s.sz+(s.ez-s.sz)*a;
      fx.pos[n+3]=s.sx+(s.ex-s.sx)*b;fx.pos[n+4]=s.sy+(s.ey-s.sy)*b;fx.pos[n+5]=s.sz+(s.ez-s.sz)*b;count++;}
      fx.line.geometry.setDrawRange(0,count*2);(fx.line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate=true;
    }
    const count=Math.min(battle.explosions.length,300);
    for(let i=0;i<count;i++){const fx=battle.explosions[i],f=fx.age/fx.duration;
      this.dummy.position.set(fx.x,fx.y,fx.z);this.dummy.rotation.set(0,0,0);this.dummy.scale.setScalar(Math.max(0.001,fx.size*(.14+f*.78)*(1-f*.72)));this.dummy.updateMatrix();this.burst.setMatrixAt(i,this.dummy.matrix);}
    this.burst.count=count;this.burst.instanceMatrix.needsUpdate=true;
    if(this.followId!==null){
      const ship=battle.ships[this.followId];
      if(ship?.alive){
        const distance=Math.max(90,ship.spec.size*9);
        const aim=new THREE.Vector3(ship.x,ship.y,ship.z);
        const desiredCamera=new THREE.Vector3(
          ship.x-Math.cos(ship.heading)*distance*.72+Math.sin(ship.heading)*distance*.42,
          ship.y-Math.sin(ship.heading)*distance*.72-Math.cos(ship.heading)*distance*.42,
          ship.z+distance*.57
        );
        this.controls.target.lerp(aim,.075);
        this.camera.position.lerp(desiredCamera,.048);
      }
    }
    this.controls.update();this.renderer.render(this.scene,this.camera);
  }
  destroy(){this.clearBattle();this.controls.dispose();this.renderer.dispose();this.canvas.remove();}
}
