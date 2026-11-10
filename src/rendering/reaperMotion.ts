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
  /** Per-limb stance, 0 = travel (limbs gathered), 1 = combat (limbs splayed, claws curled in). Render state only. */
  stance: number[];
}

/**
 * Limb stances. A Reaper under way carries its limbs gathered and swept forward; in a fight it opens them and
 * curls the claws inward around the emitter. Angles are about each limb's own hinge (radians; negative opens the
 * shoulder outward, positive curls the lower limb in). The change is slow and each limb runs on its own clock, so
 * a two-kilometre hull takes the better part of ten seconds to open: heavy, never twitchy.
 */
export const REAPER_STANCE = {
  capital: { travelShoulder: 0.05, combatShoulder: -0.27, travelElbow: -0.04, combatElbow: 0.36, seconds: 7.5, fireFlare: -0.05 },
  destroyer: { travelShoulder: 0.04, combatShoulder: -0.2, travelElbow: -0.03, combatElbow: 0.27, seconds: 2.8, fireFlare: -0.06 },
} as const;
const HINGE = new THREE.Vector3();
const STANCE_Q = new THREE.Quaternion();
/** Deterministic per-limb variation in [−1, 1] from the rig's phase and the limb's index (no RNG). */
const limbVariation = (rig: ReaperRig, i: number, salt: number): number => Math.sin(rig.phase * 7.3 + i * 2.39996 + salt);
/** Rotates a pivot about its limb hinge by `angle`, on top of the small servo wobble already set on it. */
function applyHinge(part: THREE.Object3D, angle: number): void {
  const hinge = part.userData.hinge as number[] | undefined;
  if (!hinge) return;
  part.quaternion.premultiply(STANCE_Q.setFromAxisAngle(HINGE.fromArray(hinge), angle));
}
const TAU = Math.PI * 2;

export function isArticulatedReaper(ship: Pick<ShipState,'role'|'faction'>): boolean {
  return ship.faction === 'reaper' || ship.faction === 'axiom_guard' ||
    ship.role === 'reaper_capital' || ship.role === 'reaper_destroyer';
}

export function captureReaperRig(root: THREE.Group, shipId: string): ReaperRig {
  const rig: ReaperRig = { shoulders:[], elbows:[], mandibles:[], shutters:[], phase:0, stance:[] };
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
export function animateReaperRig(rig: ReaperRig, ship: ShipState, time: number, dt: number, engaged = false): void {
  const small = ship.role === 'reaper_destroyer';
  const frequency = small ? .54 : .27;
  const shoulderAmplitude = small ? .038 : .022;
  const elbowAmplitude = small ? .063 : .034;
  const mandibleAmplitude = small ? .032 : .014;
  const speed=Math.hypot(ship.vel.x,ship.vel.y,ship.vel.z);
  const drive=Math.min(1.15,.62+speed/Math.max(.1,ship.maxSpeed)*.42);
  const fire = ship.weapons.some(w=>w.beamRemaining>0 && w.def.kind==='reaper_beam');
  // Stance: every limb eases toward travel or combat on its own clock (±25 % in pace, ±12 % in reach), so the
  // limbs open one after another instead of as one rigid fan. Firing flares the shoulders a little further.
  const pose = small ? REAPER_STANCE.destroyer : REAPER_STANCE.capital;
  const step = Math.min(Math.max(dt, 0), .1);
  const goal = engaged || fire ? 1 : 0;
  for(let i=0;i<rig.shoulders.length;i++){
    const pace = 1 + .25 * limbVariation(rig, i, 0);
    const prior = rig.stance[i] ?? 0;
    rig.stance[i] = prior + (goal - prior) * (1 - Math.exp(-step * 2.2 * pace / pose.seconds));
  }
  // Smoothstep of the eased value: the limb starts and stops gently, like a mass on an actuator.
  const eased = (i: number): number => { const s = rig.stance[i] ?? 0; return s * s * (3 - 2 * s); };
  for(let i=0;i<rig.shoulders.length;i++){
    const part=rig.shoulders[i];
    const phase=time*frequency+rig.phase+i*1.46;
    const side=part.userData.side as number || 1;
    part.rotation.set(
      shoulderAmplitude*drive*Math.sin(phase*.83),
      side*shoulderAmplitude*drive*.75*Math.sin(phase+.43),
      side*shoulderAmplitude*.48*Math.cos(phase*.63));
    const reach = 1 + .12 * limbVariation(rig, i, 1.7);
    const s = eased(i);
    applyHinge(part, pose.travelShoulder + (pose.combatShoulder * reach - pose.travelShoulder) * s + (fire ? pose.fireFlare * s : 0));
  }
  for(let i=0;i<rig.elbows.length;i++){
    const part=rig.elbows[i];
    const phase=time*frequency+rig.phase+i*1.46;
    part.rotation.set(
      elbowAmplitude*drive*Math.sin(phase*.92+.8),
      (part.userData.side as number || 1)*elbowAmplitude*.22*Math.cos(phase*.71),
      0);
    const reach = 1 + .12 * limbVariation(rig, i, 4.1);
    applyHinge(part, pose.travelElbow + (pose.combatElbow * reach - pose.travelElbow) * eased(i));
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
