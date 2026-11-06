import * as THREE from 'three';
import type { BattleSimulation } from '@/simulation/battle';
import type { ShipState, BattleEvent } from '@/simulation/types';
import { primaryGunneryMount,isMainGunShot } from '@/rendering/gunnery';
import { inWeaponArc } from '@/simulation/fireControl';
import type { BattleView } from '@/rendering/battleView';
import { KM } from '@/rendering/geometry';

const metres = (km:number)=>km >= 1 ? km.toFixed(km<10?1:0)+' KM' : Math.round(km*1000)+' M';
const pct = (a:number,b:number)=>b>0?Math.max(0,Math.min(100,Math.round(100*a/b))):0;
const tidy = (s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

/**
 * HUD-only renderer. Every marker is projected from a real simulated ship position;
 * this class never generates weapon shots, impacts or fake combat information.
 */
export class TargetTelemetry {
  readonly root:HTMLDivElement;
  private marker:HTMLDivElement;
  private panel:HTMLDivElement;
  private readout:HTMLDivElement;
  private base=new THREE.Vector3();
  private readonly line:HTMLDivElement;
  private readonly charge:HTMLElement;
  private lastShotTime=-100;
  private lastImpactTime=-100;
  private lastShotLabel='FIRE CONTROL STANDBY';
  private signalLossUntilMs=0;
  private readonly warning:HTMLDivElement;

  private target3=new THREE.Vector3();
  enabled=false;
  constructor(private stage:HTMLElement){
    const root=document.createElement('div');
    root.className='target-telemetry';
    root.hidden=true;
    root.innerHTML='<div class="target-scope"><span class="scope-top">FIRST-PERSON GUNNERY // DIRECT LIVE FIRE CONTROL</span><div class="scope-center">+</div><span class="scope-bottom">WEAPONS ARE AUTONOMOUS · NO SYNTHETIC FIRING</span></div><div class="gunnery-line" role="status"></div><div class="gunnery-warning" aria-live="polite"></div><div class="charge-track"><i class="charge-fill"></i></div><div class="target-marker" aria-hidden="true"><span></span></div><div class="target-panel"></div><div class="fire-readout"></div>';
    stage.append(root);
    this.root=root;
    this.line=root.querySelector('.gunnery-line') as HTMLDivElement;
    this.warning=root.querySelector('.gunnery-warning') as HTMLDivElement;
    this.charge=root.querySelector('.charge-fill') as HTMLElement;
    this.marker=root.querySelector('.target-marker') as HTMLDivElement;
    this.panel=root.querySelector('.target-panel') as HTMLDivElement;
    this.readout=root.querySelector('.fire-readout') as HTMLDivElement;
  }
  show(on:boolean){this.enabled=on;this.root.hidden=!on;}
  /** Called only for actual simulation events. No visual timers fire weapons. */
  notify(event:BattleEvent,shipId:string|undefined,sim?:BattleSimulation):void{
    if(!shipId)return;
    if(event.type==='ship_destroyed'&&event.shipId===shipId){
      this.signalLossUntilMs=performance.now()+1150;
      return;
    }
    if(event.type==='weapon_fired'&&event.shipId===shipId){
      const shooter=sim?.getShip(event.shipId);
      if(!shooter||!isMainGunShot(shooter,event.weaponIndex))return;
      this.lastShotTime=event.t;
      this.lastShotLabel='MAIN BATTERY DISCHARGED';
    }
    if(event.type==='projectile_impact'&&event.shipId===shipId)
      this.lastImpactTime=event.t;
  }

  update(sim:BattleSimulation,view:BattleView,shipId:string|undefined){
    if(!this.enabled)return;
    const lost=performance.now()<this.signalLossUntilMs || view.gunnerySignalLost;
    this.root.classList.toggle('signal-lost',lost);
    if(lost){
      this.marker.hidden=true;
      this.warning.textContent='';
      this.line.textContent='SIGNAL LOST · AUTO-REACQUIRING';
      this.panel.textContent='TELEMETRY LINK INTERRUPTED';
      this.readout.textContent='STANDBY';
      this.charge.style.width='0%';
      return;
    }
    const source=shipId?sim.shipById.get(shipId):undefined;
    if(!source||!source.alive||source.escaped){
      this.panel.textContent='SELECT A LIVING VESSEL TO ACCESS ITS GUNNERY TELEMETRY';
      this.readout.textContent='NO ACTIVE WEAPON PLATFORM';
      this.marker.hidden=true;
      this.root.classList.remove('reaper-hud','cerberus-hud','firing','impact');
      this.line.textContent='AWAITING ACTIVE WEAPON PLATFORM';
      this.charge.style.width='0%';
      return;
    }
    this.root.classList.toggle('reaper-hud',source.faction==='reaper');
    this.root.classList.toggle('cerberus-hud',source.faction==='cerberus');
    const target=source.targetId?sim.shipById.get(source.targetId):undefined;
    const primary=primaryGunneryMount(source);
    const cautions:string[]=[];
    if(source.hull/Math.max(1,source.maxHull)<.26)cautions.push('HULL CRITICAL');
    if(source.subsystems.engines<.24)cautions.push('PROPULSION CRITICAL');
    if(source.subsystems.weapons<.22)cautions.push('WEAPON SYSTEM DAMAGED');
    if(source.barriers/Math.max(1,source.maxBarriers)<.08)cautions.push('BARRIERS DOWN');
    this.warning.textContent=cautions.slice(0,2).join(' · ');
    const weaponLabel=primary?.def.name??'NO OFFENSIVE BATTERY';
    const cooldown=Math.max(0,primary?.cooldown??0);
    const charge=pct(Math.max(0,(primary?.def.cooldown??0)-cooldown),primary?.def.cooldown??0);
    const heat=pct(source.heat,source.heatCapacity);
    const range=target&&target.alive?Math.hypot(target.pos.x-source.pos.x,target.pos.y-source.pos.y,target.pos.z-source.pos.z):0;
    const inRange=primary&&target?range<=primary.def.range:false;
    const linedUp=!!(target&&primary&&inWeaponArc(source,primary,target.pos));
    const cooling=cooldown>0.03;
    const lock=target&&target.alive?(inRange&&linedUp?'TARGET IN FIRING ARC':inRange?'ROTATING TO TARGET':'TRACKING / OUT OF RANGE'):'SEARCHING FOR CONTACT';
    this.root.classList.toggle('firing',sim.time-this.lastShotTime<=0.22);
    this.root.classList.toggle('impact',sim.time-this.lastImpactTime<=0.28);
    this.charge.style.width=charge+'%';
    const flash=sim.time-this.lastShotTime<=1.1 ? this.lastShotLabel :
      (cooling?'MAIN GUN RECHARGING':inRange&&linedUp?'FIRING SOLUTION READY':lock);
    this.line.textContent=flash+' · '+lock;
    this.panel.innerHTML='<strong>'+tidy(source.name)+'</strong><small>'+tidy(weaponLabel)+'</small><div>WEAPON READY <b>'+charge+'%</b> · HEAT <b>'+heat+'%</b></div><div>AMMUNITION <b>'+(primary?.ammo===undefined?'UNLIMITED':String(primary.ammo))+'</b> · KILLS <b>'+source.stats.kills+'</b></div>';
    this.readout.innerHTML=target&&target.alive?
      '<div>TRACK <b>'+tidy(target.name)+'</b></div><div>RANGE <b>'+metres(range)+'</b> · '+(inRange?'WITHIN BATTERY RANGE':'OUTSIDE BATTERY RANGE')+'</div><div>TARGET BARRIERS <b>'+pct(target.barriers,target.maxBarriers)+'%</b> · HULL <b>'+pct(target.hull,target.maxHull)+'%</b></div>':
      '<div>NO LOCKED TARGET</div><div>AUTONOMOUS FIRE CONTROL SEARCHING</div>';
    if(!target||!target.alive){this.marker.hidden=true;return;}
    this.base.set(source.pos.x*KM,source.pos.y*KM,source.pos.z*KM);
    this.target3.set(target.pos.x*KM,target.pos.y*KM,target.pos.z*KM);
    const cam=view.rig.camera;
    cam.updateMatrixWorld();
    const projected=this.target3.clone().project(cam);
    const dir=this.target3.clone().sub(cam.position);
    const forward=cam.getWorldDirection(new THREE.Vector3());
    const visible=dir.dot(forward)>0 && Number.isFinite(projected.x) && Math.abs(projected.x)<=.96 && Math.abs(projected.y)<=.9;
    this.marker.hidden=!visible;
    if(visible){
      this.marker.style.left=((projected.x+1)*50)+'%';
      this.marker.style.top=((1-projected.y)*50)+'%';
      this.marker.title='Real tracked target: '+target.name;
    }
  }
}
