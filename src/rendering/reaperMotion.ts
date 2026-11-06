import * as THREE from 'three';
import type { ShipState } from '@/simulation/types';
import { primaryGunneryMount } from './gunnery';

/** Only articulated, rigid subassemblies move. No mesh skin stretching,
 * ship transform changes, hitbox changes, or simulation RNG consumption.
 */
export interface ReaperRig {
  shoulders: THREE.Group[];
  elbows: THREE.Group[];
  mandibles: THREE.Group[];
  shutters: THREE.Group[];
  emitter?: THREE.Object3D;
  headlight?: THREE.Object3D;
  phase: number;
}
const TAU = Math.PI * 2;

export function isArticulatedReaper(ship: Pick<ShipState,'role'|'faction'>): boolean {
  return ship.faction === 'reaper' || ship.faction === 'axiom_guard' ||
    ship.role === 'reaper_capital' || ship.role === 'reaper_destroyer';
}

export function captureReaperRig(root: THREE.Group, shipId: string): ReaperRig {
  const rig: ReaperRig = { shoulders:[], elbows:[], mandibles:[], shutters:[], phase:0 };
  let hash = 2166136261;
  for (let i=0;i<shipId.length;i++) hash=Math.imul(hash^shipId.charCodeAt(i),16777619);
  rig.phase=(hash>>>0)/4294967296*TAU;
  root.traverse(o=>{
    const part=o.userData.reaperRig as string | undefined;
    if(part==='shoulder')rig.shoulders.push(o as THREE.Group);
    else if(part==='elbow')rig.elbows.push(o as THREE.Group);
    else if(part==='mandible')rig.mandibles.push(o as THREE.Group);
    else if(part==='shutter')rig.shutters.push(o as THREE.Group);
    if(o.name==='eye'){
      if(!rig.emitter)rig.emitter=o;
      else rig.headlight=o;
    }
  });
  return rig;
}

/** Smoothly actuated Mass Effect-like mechanical behaviour.
 * Capitals move with heavy, near-imperceptible servo cycles; destroyers have
 * faster independent joints. Shell plates remain rigid and metallic.
 */
export function animateReaperRig(rig: ReaperRig, ship: ShipState, time: number, dt: number): void {
  const small = ship.role === 'reaper_destroyer';
  const frequency = small ? .54 : .27;
  const shoulderAmplitude = small ? .038 : .015;
  const elbowAmplitude = small ? .063 : .027;
  const mandibleAmplitude = small ? .032 : .014;
  const speed=Math.hypot(ship.vel.x,ship.vel.y,ship.vel.z);
  const drive=Math.min(1.15,.62+speed/Math.max(.1,ship.maxSpeed)*.42);
  const fire = ship.weapons.some(w=>w.beamRemaining>0 && w.def.kind==='reaper_beam');
  for(let i=0;i<rig.shoulders.length;i++){
    const part=rig.shoulders[i];
    const phase=time*frequency+rig.phase+i*1.46;
    const side=part.userData.side as number || 1;
    part.rotation.x=shoulderAmplitude*drive*Math.sin(phase*.83);
    part.rotation.y=side*shoulderAmplitude*drive*.75*Math.sin(phase+.43)+(fire?side*.008:0);
    part.rotation.z=side*shoulderAmplitude*.48*Math.cos(phase*.63);
  }
  for(let i=0;i<rig.elbows.length;i++){
    const part=rig.elbows[i];
    const phase=time*frequency+rig.phase+i*1.46;
    part.rotation.x=elbowAmplitude*drive*Math.sin(phase*.92+.8);
    part.rotation.y=(part.userData.side as number || 1)*elbowAmplitude*.22*Math.cos(phase*.71);
    part.rotation.z=0;
  }
  for(let i=0;i<rig.mandibles.length;i++){
    const part=rig.mandibles[i];
    const phase=time*frequency+rig.phase+i*.85;
    part.rotation.y=mandibleAmplitude*Math.sin(phase+.25);
    part.rotation.x=mandibleAmplitude*.6*Math.cos(phase*.8);
  }
  // The central beam is emitted from a rigid eye. Mechanical blast shutters
  // retract when a shot is imminent or an active beam is present.
  const primary=primaryGunneryMount(ship);
  const beam=primary?.def.kind==='reaper_beam' || primary?.def.kind==='thanix';
  const charging=beam && !!ship.targetId && primary!.cooldown<.9;
  const openGoal=fire?1:charging?.78:0.11;
  const k=1-Math.exp(-Math.min(Math.max(dt,0),.1)*(small?6:3.7));
  for(let i=0;i<rig.shutters.length;i++){
    const part=rig.shutters[i];
    const prior=(part.userData.open as number|undefined)??.11;
    const open=prior+(openGoal-prior)*k;
    part.userData.open=open;
    part.rotation.y=open*(small?.58:.45);
    part.rotation.x=(i%2?1:-1)*open*.09;
  }
  // The rigid luminous lens barely shifts inside its armoured aperture.
  // No broad emissive wash is introduced into the dark cinematic scene.
  if(rig.emitter){
    const aperture=1+(fire?.06:charging?.025:0)+.007*Math.sin(time*(small?1:.55)+rig.phase);
    rig.emitter.scale.setScalar(aperture);
  }
  if(rig.headlight) rig.headlight.scale.setScalar(1+(fire?.05:0));
}
