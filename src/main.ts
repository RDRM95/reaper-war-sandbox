import './spectator.css';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { BattleView } from '@/rendering/battleView';
import type { CameraMode } from '@/rendering/cameras';
import type { BattleEvent, FormationType, ShipState, Side } from '@/simulation/types';
import { buildCustomBattle } from '@/scenarios';
import { SHIP_CLASS_LIST } from '@/data/ships';
import { MASS_EFFECT_FACTION_IDS, type MassEffectFactionId } from '@/data/types';
import { FACTIONS } from '@/data/factions';
import { audio } from '@/audio/engine';
import { FleetMap2D } from './spectator/flatView';
import { TargetTelemetry } from './spectator/targetTelemetry';

type Fleet = { faction:MassEffectFactionId; name:string; formation:FormationType; counts:Record<string,number> };
type ScreenMode = '3d'|'2d';
type GraphicsPreset = 'low'|'medium'|'high'|'ultra';
const parameters = new URLSearchParams(window.location.search);
const referenceMode = parameters.get('reference') === 'sol-42';
const requestedShips = Math.min(12000, Math.max(0, Math.floor(Number(parameters.get('ships')) || 0)));
const referenceSeconds = Math.min(120, Math.max(0, Number(parameters.get('t') ?? 18) || 18));
const $ = <T extends HTMLElement = HTMLElement>(id:string):T => {
  const value=document.getElementById(id);
  if(!value) throw new Error('Missing interface element: '+id);
  return value as T;
};
const escapeHtml=(s:string):string=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt=(n:number)=>n.toLocaleString('en-GB');
const clock=(s:number)=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');
const scenarios:Record<string,{a:Fleet;b:Fleet;environment:string;rules:string;range:number}> = {
  sol:{a:{faction:'alliance',name:'Systems Alliance Fifth Fleet',formation:'line_abreast',counts:{alliance_dreadnought:6,alliance_cruiser:14,alliance_frigate:25,alliance_carrier:1}},b:{faction:'reaper',name:'Reaper vanguard',formation:'strike_wedge',counts:{reaper_capital:3,reaper_destroyer:12}},environment:'earth_orbit',rules:'prime_apex',range:110},
  battleline:{a:{faction:'alliance',name:'Alliance battle line',formation:'line_abreast',counts:{alliance_dreadnought:10,alliance_cruiser:28,alliance_frigate:40}},b:{faction:'reaper',name:'Reaper capital group',formation:'capital_column',counts:{reaper_capital:5,reaper_destroyer:20}},environment:'deep_space',rules:'prime_apex',range:140},
  cerberus:{a:{faction:'cerberus',name:'Cerberus Black Fleet',formation:'strike_wedge',counts:{cerberus_dreadnought:8,cerberus_cruiser:20,cerberus_frigate:25}},b:{faction:'reaper',name:'Reaper harvest flotilla',formation:'capital_column',counts:{reaper_capital:3,reaper_destroyer:14}},environment:'deep_space',rules:'cerberus_ascendant',range:100},
  duel:{a:{faction:'alliance',name:'SSV Kilimanjaro',formation:'capital_column',counts:{alliance_dreadnought:1}},b:{faction:'reaper',name:'Sovereign-class Reaper',formation:'capital_column',counts:{reaper_capital:1}},environment:'deep_space',rules:'prime_apex',range:90},
  palaven:{a:{faction:'turian',name:'Hierarchy defence fleet',formation:'line_abreast',counts:{turian_dreadnought:7,turian_cruiser:18,turian_frigate:30}},b:{faction:'reaper',name:'Reaper orbital spearhead',formation:'strike_wedge',counts:{reaper_capital:4,reaper_destroyer:15}},environment:'palaven_orbit',rules:'prepared_galaxy',range:115}
};
function copyFleet(f:Fleet):Fleet {return {faction:f.faction,name:f.name,formation:f.formation,counts:{...f.counts}};}
let selectedScenario='sol',fleets:Record<Side,Fleet>={A:copyFleet(scenarios.sol.a),B:copyFleet(scenarios.sol.b)};
type Reinforcement = {delay:number;counts:Record<string,number>};
const freshWave=():Reinforcement=>({delay:120,counts:{}});
let waves:Record<Side,Reinforcement>={A:freshWave(),B:freshWave()};
let activeSide:Side='A',mode:ScreenMode='3d',speed=1,paused=false,audioEnabled=false;
let sim:BattleSimulation|null=null,view:BattleView|null=null,flat: FleetMap2D|null=null;
let selectedShip:string|undefined,following=false,accum=0,last=0,lastHud=0;
let viewError:string|undefined;
let gunnery=false;
let graphics:GraphicsPreset = 'high';
let fpsCounter=0,fpsLast=0,fpsValue=0,simWorkMs=0;
const frameTimes:number[]=[];
const feed:{time:number;message:string;side?:Side}[]=[];
const app=document.getElementById('app')!;
app.innerHTML=`
<header class="rw-header"><div class="brand"><small>MASS EFFECT / FAN-MADE SIMULATION</small><strong>REAPER WAR <span>— SPECTATOR</span></strong></div>
  <div class="header-right"><span class="status" id="state">READY TO DEPLOY</span><button id="sound" class="plain">SOUND OFF</button></div></header>
<div class="rw-layout">
  <aside class="pane rw-setup"><div class="pane-heading">FLEET BUILDER <span>01</span></div>
    <label>SCENARIO</label><select id="scenario">
       <option value="sol">SOL DEFENCE / APEX</option><option value="battleline">BATTLE LINE / HEAVY</option>
       <option value="cerberus">CERBERUS BLACK FLEET</option><option value="duel">DREADNOUGHT VS SOVEREIGN</option>
       <option value="palaven">PALAVEN / HIERARCHY</option></select>
    <label>COMBAT RULES</label><select id="rules">
      <option value="prime_apex">PRIME APEX — PREPARED GALAXY</option>
      <option value="canon_me3">ORIGINAL TRILOGY</option>
      <option value="prepared_galaxy">PREPARED GALAXY</option>
      <option value="humanity_ascendant">HUMANITY ASCENDANT</option>
      <option value="cerberus_ascendant">CERBERUS ASCENDANT</option>
      <option value="iron_dawn">IRON DAWN</option>
      <option value="multiverse_crossover">SANDBOX — MULTIVERSE</option>
    </select>
    <div class="double"><label>SEED <input id="seed" type="number" value="42" min="1"></label><label>DISTANCE, KM <input id="distance" type="number" value="110" min="10" max="600"></label></div>
    <div class="side-tabs"><button id="sideA" class="active">SIDE A <b id="countA"></b></button><button id="sideB">SIDE B <b id="countB"></b></button></div>
    <label>FACTION</label><select id="faction"></select>
    <label>FORMATION</label><select id="formation"><option value="line_abreast">Broad battle line</option><option value="strike_wedge">Strike wedge</option><option value="defensive_screen">Defensive screen</option><option value="capital_column">Capital ship column</option><option value="fighter_screen">Fighter screen</option><option value="dispersed">Dispersed</option></select>
    <label class="wave-time">REINFORCEMENTS ARRIVE AFTER (S) <input id="wave-time" type="number" min="1" max="600" value="120"></label>
    <div class="roster-header">VESSEL CLASS <span>START / WAVE</span></div><div class="fleet-roster" id="roster"></div>
    <div class="left-footer"><p>Pure Battle: fleets choose their own movement and targets. Optional focus orders below never guarantee hits.</p><button id="launch" class="primary">▶  LAUNCH BATTLE</button></div>
  </aside>
  <main class="rw-middle">
    <div class="toolbar"><div class="seg"><button id="toggle3d" class="active">3D CINEMATIC</button><button id="toggle2d">2D FLEET VIEW</button></div>
       <div class="seg"><select id="graphics" aria-label="Graphics preset" title="Graphics quality"><option value="low">PERFORMANCE</option><option value="medium">BALANCED</option><option value="high" selected>HIGH</option><option value="ultra">RTX CINEMATIC</option></select><button id="clean">HUD OFF</button><button id="pause">Ⅱ</button><select id="speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select><button id="restart">↻</button></div></div>
    <div id="stage" class="stage"><canvas id="scene3d"></canvas><canvas id="scene2d"></canvas>
      <div class="stage-tag"><small>BATTLESPACE / AUTONOMOUS SIMULATION</small><strong id="battle-name">SOL DEFENCE</strong></div>
      <div id="error" class="error" hidden></div>
      <div class="camera-rail"><button id="cine">CINEMATIC</button><button id="tactical">ORBIT CAMERA</button><button id="chase">FOLLOW</button><button id="reaper-cam">REAPER VIEW</button><button id="gunner">GUNNERY TRACK</button></div>
      <div class="stage-foot"><div><small>ENGAGEMENT TIME</small><strong id="clock">00:00</strong></div><div id="message">AWAITING DEPLOYMENT</div><div class="stage-legend"><span class="dot blue"></span> ALLIED <span class="dot red"></span> OPPOSING</div></div></div>
    <div class="bottom-line"><span>ORIGINAL REAPER WAR SIMULATION CORE</span><span>NO TACTICAL ORDERS</span><span>ME3-ERA SHIP GENERATORS</span><span id="perf" aria-label="Renderer performance">— FPS</span></div>
  </main>
  <aside class="pane rw-data"><div class="pane-heading">ENGAGEMENT TELEMETRY <span>02</span></div>
    <div class="team"><div class="team-title">SIDE A <strong id="aliveA">—</strong></div><div class="meter"><i id="meterA"></i></div><div class="pair">HULLS LOST <b id="lostA">—</b></div></div>
    <div class="team red-team"><div class="team-title">SIDE B <strong id="aliveB">—</strong></div><div class="meter"><i id="meterB"></i></div><div class="pair">HULLS LOST <b id="lostB">—</b></div></div>
    <div class="pane-heading with-border">SHIP INSPECTION <span>03</span></div>
    <div id="selection" class="selection">Click a vessel in either spectator camera to inspect its condition.</div>
    <button id="follow" class="plain full">FOLLOW SELECTED</button>
    <button id="focus" class="plain full" disabled>FOCUS OPPOSING FLEET ON SELECTED</button>
    <button id="autonomy" class="plain full">RESTORE AUTONOMOUS TARGETING</button>
    <button id="volley" class="plain full" disabled>FIRE READY SPINAL BATTERIES</button>
    <div class="pane-heading with-border">BATTLE LOG <span>04</span></div><div id="log" class="log">Waiting for engagement…</div>
  </aside>
</div><footer>INDEPENDENT NON-COMMERCIAL FAN PROJECT · ORIGINAL SOURCE-BASED 3D ENGINE · BUILD 0.3 DEVELOPMENT</footer>
`;
const factionSelect=$<HTMLSelectElement>('faction');
factionSelect.innerHTML=MASS_EFFECT_FACTION_IDS.map(id=>`<option value="${id}">${escapeHtml(FACTIONS[id].name)}</option>`).join('');
const third=$<HTMLCanvasElement>('scene3d'),second=$<HTMLCanvasElement>('scene2d');
flat=new FleetMap2D(second);
const telemetry=new TargetTelemetry($('stage'));
flat.onPick=s=>select(s);
function rowTally(f:Fleet){return Object.values(f.counts).reduce((a,b)=>a+Math.max(0,b),0);}
function editor(){const f=fleets[activeSide],wave=waves[activeSide];factionSelect.value=f.faction;$<HTMLSelectElement>('formation').value=f.formation;
  $<HTMLInputElement>('wave-time').value=String(wave.delay);
  $('sideA').classList.toggle('active',activeSide==='A');$('sideB').classList.toggle('active',activeSide==='B');
  $('countA').textContent=fmt(rowTally(fleets.A))+' + '+fmt(rowTally({ ...fleets.A,counts:waves.A.counts }));
  $('countB').textContent=fmt(rowTally(fleets.B))+' + '+fmt(rowTally({ ...fleets.B,counts:waves.B.counts }));
  const classes=SHIP_CLASS_LIST.filter(cls=>cls.faction===f.faction);
  $('roster').innerHTML=classes.map(cls=>`<label class="ship-row" title="${escapeHtml(cls.description)}"><span><b>${escapeHtml(cls.shortName||cls.name)}</b><small>${cls.role.toUpperCase()}</small></span><div class="ship-quantities"><input data-kind="start" data-class="${cls.id}" type="number" min="0" max="9999" value="${f.counts[cls.id]??0}" aria-label="${escapeHtml(cls.name)} initial count"><input data-kind="wave" data-class="${cls.id}" type="number" min="0" max="9999" value="${wave.counts[cls.id]??0}" aria-label="${escapeHtml(cls.name)} reinforcements"></div></label>`).join('');
  $('roster').querySelectorAll<HTMLInputElement>('input').forEach(input=>input.addEventListener('input',()=>{
    const target=input.dataset.kind==='wave'?wave.counts:f.counts;
    target[input.dataset.class!]=Math.min(9999,Math.max(0,Math.floor(Number(input.value)||0)));
    $('countA').textContent=fmt(rowTally(fleets.A))+' + '+fmt(rowTally({...fleets.A,counts:waves.A.counts}));
    $('countB').textContent=fmt(rowTally(fleets.B))+' + '+fmt(rowTally({...fleets.B,counts:waves.B.counts}));
  }));
}
function applyScenario(id:string){const p=scenarios[id];selectedScenario=id;fleets={A:copyFleet(p.a),B:copyFleet(p.b)};waves={A:freshWave(),B:freshWave()};
  $<HTMLSelectElement>('rules').value=p.rules;$<HTMLInputElement>('distance').value=String(p.range);$('battle-name').textContent=$<HTMLSelectElement>('scenario').selectedOptions[0].textContent??'BATTLE';
  editor();
}
/** Opt-in benchmark roster: preserves faction and relative composition while
 * allocating an exact requested number of ships. Normal play is untouched. */
function scaleFleetForBenchmark(total:number):void{
  const entries:( {side:Side;classId:string;count:number;fraction:number} )[]=[];
  const original=rowTally(fleets.A)+rowTally(fleets.B);
  if(original<=0)return;
  for(const side of ['A','B'] as Side[])for(const [classId,n] of Object.entries(fleets[side].counts)){
    if(n<=0)continue;
    const raw=n*total/original;
    entries.push({side,classId,count:Math.floor(raw),fraction:raw%1});
  }
  const left=total-entries.reduce((sum,e)=>sum+e.count,0);
  entries.sort((a,b)=>b.fraction-a.fraction);
  for(let i=0;i<left;i++)entries[i%entries.length].count++;
  fleets.A.counts={};fleets.B.counts={};
  for(const e of entries)fleets[e.side].counts[e.classId]=e.count;
  editor();
}
$('sideA').addEventListener('click',()=>{activeSide='A';editor();});
$('sideB').addEventListener('click',()=>{activeSide='B';editor();});
factionSelect.addEventListener('change',()=>{const f=fleets[activeSide];f.faction=factionSelect.value as MassEffectFactionId;f.counts={};waves[activeSide]=freshWave();f.name=FACTIONS[f.faction].name+' task force';editor();});
$('wave-time').addEventListener('change',()=>{waves[activeSide].delay=Math.min(600,Math.max(1,Math.floor(Number($<HTMLInputElement>('wave-time').value)||120)));});
$('formation').addEventListener('change',()=>{fleets[activeSide].formation=$<HTMLSelectElement>('formation').value as FormationType;});
$('scenario').addEventListener('change',()=>applyScenario($<HTMLSelectElement>('scenario').value));
function reportError(err:unknown){viewError=err instanceof Error?err.message:String(err);
  const target=$('error');target.hidden=false;target.textContent='SIMULATOR ERROR: '+viewError;
  $('message').textContent='STARTUP FAILED';$('state').textContent='ERROR';console.error(err);
}
function select(ship:ShipState|undefined){selectedShip=ship?.id;following=false;flat!.selected=selectedShip;
  if(view){view.selectedIds.clear();if(ship)view.selectedIds.add(ship.id);}
  inspect();
}
function inspect(){if(!sim||!selectedShip){$('selection').textContent='Click a vessel in either spectator camera to inspect its condition.';$<HTMLButtonElement>('focus').disabled=true;$<HTMLButtonElement>('volley').disabled=true;return;}
  const s=sim.shipById.get(selectedShip);if(!s){selectedShip=undefined;return;}
  $<HTMLButtonElement>('focus').disabled=!s.alive;
  $<HTMLButtonElement>('volley').disabled=!s.alive||s.role!=='dreadnought'||s.faction==='reaper';
  const hull=Math.max(0,Math.round(100*s.hull/Math.max(1,s.maxHull))),shields=Math.max(0,Math.round(100*s.barriers/Math.max(1,s.maxBarriers)));
  $('selection').innerHTML=`<div class="ship-title">${escapeHtml(s.name)}</div><div class="ship-subtitle">${escapeHtml(s.classId.replaceAll('_',' ').toUpperCase())} · SIDE ${s.side}</div><div class="ship-bar-label">HULL <b>${hull}%</b></div><div class="ship-meter"><i style="width:${hull}%"></i></div><div class="ship-bar-label">BARRIERS <b>${shields}%</b></div><div class="ship-meter shield"><i style="width:${shields}%"></i></div><div class="ship-detail">KILLS <b>${s.stats.kills}</b> · ${s.alive?'OPERATIONAL':'DESTROYED'}</div>`;
}
function updateHud(){if(!sim)return;
  $('clock').textContent=clock(sim.time);
  if(feed.length)$('log').innerHTML=feed.slice(0,22).map(item=>`<div class="entry ${item.side==='A'?'a':'b'}"><time>${clock(item.time)}</time>${escapeHtml(item.message)}</div>`).join('');
  for(const side of ['A','B'] as Side[]){const ships=sim.ships.filter(s=>s.side===side&&s.role!=='fighter');
    const alive=ships.filter(s=>s.alive&&!s.escaped).length;
    $('alive'+side).textContent=fmt(alive)+' / '+fmt(ships.length);
    $('lost'+side).textContent=fmt(ships.filter(s=>!s.alive).length);
    $('meter'+side).style.width=(100*alive/Math.max(1,ships.length)).toFixed(1)+'%';
  }
  inspect();
  if(sim.finished){paused=true;$('state').textContent='BATTLE COMPLETE';
    $('message').textContent=sim.result?.winner==='draw'?'DRAW':`SIDE ${sim.result?.winner??'?'} VICTORIOUS`;}
}
function pushEvent(e:BattleEvent){if(e.type==='ship_destroyed'){
    const killer=e.killerId?sim?.shipById.get(e.killerId)?.name:'Unknown';feed.unshift({time:e.t,message:e.name+' destroyed'+(killer?' · '+killer:''),side:e.side});
    if(audioEnabled)audio.play(e.role==='dreadnought'||e.role==='reaper_capital'?'explosion_large':'explosion_small',150,.65);
  }else if(e.type==='comms'){feed.unshift({time:e.t,message:e.text,side:e.side});}
  else if(e.type==='reinforcement_arrival'){feed.unshift({time:e.t,message:'REINFORCEMENTS ARRIVED: '+e.fleetId,side:e.side});}
  else if(e.type==='order_issued'){feed.unshift({time:e.t,message:'COMMAND: '+e.order});}
  else if(e.type==='hades_detonation'&&audioEnabled){audio.play('hades_internal',100,.7);}
  if(feed.length>50)feed.length=50;
  // DOM log is updated at HUD cadence, not once per combat event.
}
function attachEvents(){if(!sim)return;const previous=sim.onEvent;sim.onEvent=e=>{previous?.(e);pushEvent(e);};}
function createView(preserveCamera=false){if(!sim)return;
  const cameraState=preserveCamera&&view?{
    mode:view.rig.mode,focus:view.rig.focus.clone(),yaw:view.rig.yaw,
    pitch:view.rig.pitch,distance:view.rig.distance,followId:view.followId,
    selected:[...view.selectedIds],position:view.rig.camera.position.clone(),
    quaternion:view.rig.camera.quaternion.clone()
  }:undefined;
  view?.dispose();view=null;
  try{
    const ratio = graphics==='low'?0.75:graphics==='medium'?1:graphics==='high'?1.25:1.6;
    view=new BattleView(third,sim,{quality:graphics,pixelRatioCap:ratio,showEngineGlow:graphics!=='low',lod:true,bloom:graphics==='ultra'});
    view.resize(third.clientWidth||900,third.clientHeight||550);
    view.rig.setMode(referenceMode?'tactical':'cinematic');
    if(referenceMode){
      view.referenceCamera=true;
      view.rig.camera.position.set(600,420,950);
      view.rig.camera.lookAt(0,0,0);
      view.rig.camera.updateMatrixWorld(true);
    }
    if(cameraState&&!referenceMode){
      view.rig.setMode(cameraState.mode);
      view.rig.focus.copy(cameraState.focus);
      view.rig.yaw=cameraState.yaw;view.rig.pitch=cameraState.pitch;
      view.rig.distance=cameraState.distance;view.followId=cameraState.followId;
      for(const id of cameraState.selected)view.selectedIds.add(id);
      view.rig.camera.position.copy(cameraState.position);
      view.rig.camera.quaternion.copy(cameraState.quaternion);
      view.rig.camera.updateMatrixWorld(true);
    }
    attachEvents();
  }catch(e){mode='2d';switchMode();reportError('3D renderer unavailable; switched to 2D: '+String(e));}
}
function launch(){try{
  $('error').hidden=true;viewError=undefined;
  const config=buildCustomBattle({seed:Math.max(1,Math.floor(Number($<HTMLInputElement>('seed').value)||42)),rulesId:$<HTMLSelectElement>('rules').value,
    environment:scenarios[selectedScenario].environment as 'earth_orbit'|'palaven_orbit'|'deep_space',
    startingDistanceKm:Math.max(10,Math.min(600,Number($<HTMLInputElement>('distance').value)||110)),
    maxDuration:650,
    sideA:{...copyFleet(fleets.A)},sideB:{...copyFleet(fleets.B)},
    extraA:rowTally({...fleets.A,counts:waves.A.counts})>0?[{...copyFleet(fleets.A),name:fleets.A.name+' reinforcements',counts:{...waves.A.counts},arrivalTime:waves.A.delay}]:[],
    extraB:rowTally({...fleets.B,counts:waves.B.counts})>0?[{...copyFleet(fleets.B),name:fleets.B.name+' reinforcements',counts:{...waves.B.counts},arrivalTime:waves.B.delay}]:[]});
  view?.dispose();view=null;
  sim=new BattleSimulation(config);
  if(referenceMode){
    for(let i=0;i<Math.round(referenceSeconds/SIM_DT)&&!sim.finished;i++)sim.step();
  }
  flat!.reset();selectedShip=undefined;following=false;gunnery=false;telemetry.show(false);feed.length=0;accum=0;paused=referenceMode;
  if(referenceMode)$('pause').textContent='▶';
  $('battle-name').textContent=config.name.toUpperCase();$('state').textContent='ENGAGEMENT LIVE';$('message').textContent='FLEETS ENGAGING';
  $('launch').textContent='↻ REDEPLOY';$('log').textContent='Contacts acquired.';
  if(audioEnabled){audio.init();}
  if(mode==='3d')createView();switchMode();updateHud();
}catch(e){reportError(e);}}
function switchMode(){
  // Release the entire WebGL scene in 2D mode. Rebuild it on demand when returning to 3D.
  // Otherwise the inactive renderer keeps thousands of meshes and queued effects in memory.
  if(mode==='2d'&&view){view.dispose();view=null;if(sim)sim.onEvent=pushEvent;}
  third.style.display=mode==='3d'?'block':'none';second.style.display=mode==='2d'?'block':'none';
  $('toggle3d').classList.toggle('active',mode==='3d');$('toggle2d').classList.toggle('active',mode==='2d');
  $('stage').classList.toggle('flat',mode==='2d');
  telemetry.show(gunnery&&mode==='3d');
  if(mode==='3d'&&view)view.resize(third.clientWidth||900,third.clientHeight||550);
}
$('toggle3d').addEventListener('click',()=>{mode='3d';if(!view&&sim)createView();switchMode();});
$('toggle2d').addEventListener('click',()=>{mode='2d';switchMode();});
$('launch').addEventListener('click',launch);$('restart').addEventListener('click',launch);
$('pause').addEventListener('click',()=>{paused=!paused;$('pause').textContent=paused?'▶':'Ⅱ';$('state').textContent=paused?'PAUSED':'ENGAGEMENT LIVE';});
$('speed').addEventListener('change',()=>{speed=Math.max(1,Number($<HTMLSelectElement>('speed').value)||1);});
$('graphics').addEventListener('change',()=>{graphics=$<HTMLSelectElement>('graphics').value as GraphicsPreset;if(mode==='3d'&&sim)createView(true);});
$('sound').addEventListener('click',()=>{audioEnabled=!audioEnabled;if(audioEnabled)audio.init();audio.settings.muted=!audioEnabled;audio.applySettings();$('sound').textContent=audioEnabled?'SOUND ON':'SOUND OFF';});
function camera(mode:CameraMode){if(!view||!sim)return;view.rig.setMode(mode);}
$('cine').addEventListener('click',()=>{gunnery=false;telemetry.show(false);camera('cinematic');});
$('tactical').addEventListener('click',()=>{gunnery=false;telemetry.show(false);camera('tactical');});
$('reaper-cam').addEventListener('click',()=>{gunnery=false;telemetry.show(false);camera('reaper');});
$('gunner').addEventListener('click',()=>{gunnery=true;mode='3d';switchMode();camera('follow');if(view&&selectedShip)view.followId=selectedShip;telemetry.show(true);});
$('clean').addEventListener('click',()=>{gunnery=false;telemetry.show(false);$('stage').classList.toggle('clean-recording');});
$('chase').addEventListener('click',()=>{$('follow').click();});
$('follow').addEventListener('click',()=>{if(!selectedShip||!sim)return;following=!following;if(view){view.followId=following?selectedShip:undefined;view.rig.setMode(following?'follow':'cinematic');}$('follow').textContent=following?'RELEASE FOLLOW':'FOLLOW SELECTED';});
$('focus').addEventListener('click',()=>{
  if(!sim||!selectedShip||sim.finished)return;const target=sim.getShip(selectedShip);if(!target||!target.alive)return;
  const opposing:Side=target.side==='A'?'B':'A';
  for(const f of sim.fleets.values())if(f.spec.side===opposing&&f.arrived)sim.issueOrders(f.spec.id,{order:'attack_target',targetId:target.id,focusFire:true});
  $('message').textContent='FLEETS REDIRECTED TO '+target.name.toUpperCase();
});
$('autonomy').addEventListener('click',()=>{
  if(!sim||sim.finished)return;for(const f of sim.fleets.values())if(f.arrived)sim.issueOrders(f.spec.id,{order:'attack',targetId:undefined,focusFire:false,priority:'default'});
  $('message').textContent='AUTONOMOUS TARGETING RESTORED';
});
$('volley').addEventListener('click',()=>{
  if(!sim||!selectedShip||sim.finished)return;const ship=sim.getShip(selectedShip);
  if(!ship||!ship.alive||ship.faction==='reaper')return;
  $('message').textContent=sim.releasePrimaryVolley(ship.fleetId)?'READY SPINAL BATTERIES: FIRE':'SPINAL SALVO UNAVAILABLE';
});
let pointer:{x:number;y:number;button:number;moved:boolean}|null=null;
third.addEventListener('contextmenu',e=>e.preventDefault());
third.addEventListener('pointerdown',e=>{pointer={x:e.clientX,y:e.clientY,button:e.button,moved:false};third.setPointerCapture(e.pointerId);});
third.addEventListener('pointermove',e=>{if(!pointer||!view)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
  if(Math.abs(dx)+Math.abs(dy)>2)pointer.moved=true;
  if(pointer.moved){if(pointer.button===1)view.rig.pan(dx,dy);else view.rig.orbit(dx,dy);}
  pointer.x=e.clientX;pointer.y=e.clientY;});
third.addEventListener('pointerup',e=>{if(!pointer||!view)return;const moved=pointer.moved;pointer=null;
  if(!moved){const r=third.getBoundingClientRect();select(view.pick(e.clientX-r.left,e.clientY-r.top,r.width,r.height));}});
third.addEventListener('wheel',e=>{if(!view)return;e.preventDefault();view.rig.zoom(e.deltaY);},{passive:false});
window.addEventListener('resize',()=>{if(view&&mode==='3d')view.resize(third.clientWidth||900,third.clientHeight||550);});
// Fixed simulation steps remain deterministic. A wall-clock budget keeps the UI responsive
// instead of allowing dozens of expensive ticks to block the browser on large battles.
function frame(now:number){const elapsedMs=last?Math.max(0,now-last):16.667;const dt=Math.min(.1,elapsedMs/1000);last=now;
  frameTimes.push(elapsedMs);
  if(frameTimes.length>240)frameTimes.shift();
  if(sim){if(!paused&&!sim.finished){
      accum=Math.min(0.5,accum+dt*speed);
      const started=performance.now();let steps=0;
      while(accum>=SIM_DT&&steps<10&&!sim.finished){
        sim.step();accum-=SIM_DT;steps++;
        if(performance.now()-started>9)break;
      }
      simWorkMs=performance.now()-started;
    }
    const alpha=paused?1:Math.min(1,accum/SIM_DT);
    if(mode==='3d'&&view){view.update(dt,alpha);view.render();telemetry.update(sim,view,selectedShip);}
    if(mode==='2d'){if(following&&selectedShip){const ship=sim.shipById.get(selectedShip);if(ship&&ship.alive)flat!.focus(ship);}flat!.draw(sim);}
    fpsCounter++;
    if(!fpsLast)fpsLast=now;
    if(now-fpsLast>=1000){fpsValue=Math.round(fpsCounter*1000/(now-fpsLast));fpsCounter=0;fpsLast=now;}
    if(now-lastHud>280){lastHud=now;updateHud();
      $('perf').textContent=mode==='3d'&&view?
        fpsValue+' FPS · '+view.drawCalls+' DRAWS · '+Math.round(view.frameTriangles/1000)+'K TRI · GPU '+(view.gpuFrameMs?.toFixed(1)??'N/A')+'MS · SIM '+simWorkMs.toFixed(1)+'MS':
        fpsValue+' FPS · 2D · SIM '+simWorkMs.toFixed(1)+'MS';
    }
  }
  requestAnimationFrame(frame);
}
// Read-only testing interface. No gameplay state is changed by inspection.
(window as Window & { __reaperDiagnostics?: () => unknown }).__reaperDiagnostics=()=>({
  seed:sim?.config.seed,time:sim?.time,shipCount:sim?.ships.length,
  frameMsAverage:frameTimes.reduce((a,b)=>a+b,0)/Math.max(1,frameTimes.length),
  frameMsP95:[...frameTimes].sort((a,b)=>a-b)[Math.max(0,Math.floor(frameTimes.length*0.95)-1)]??0,
  fps:fpsValue,simCpuMs:simWorkMs,
  liveShips:sim?.ships.filter(s=>s.alive&&!s.escaped).length,
  ships:sim?.ships.map(s=>({id:s.id,side:s.side,position:{...s.pos},heading:{...s.heading}})),
  view: view?{
    camera: view.rig.camera.position.toArray(),
    quaternion: view.rig.camera.quaternion.toArray(),
    drawCalls:view.drawCalls,triangles:view.frameTriangles,renderCpuMs:view.renderCpuMs,gpuFrameMs:view.gpuFrameMs,
    exposure:view.renderer.toneMappingExposure,
    lodCounts:view.lodCounts,quality:graphics
  }:null
});
applyScenario('sol');if(requestedShips>0)scaleFleetForBenchmark(requestedShips);switchMode();launch();requestAnimationFrame(frame);
window.addEventListener('error',e=>{if(e.error)reportError(e.error);});
window.addEventListener('unhandledrejection',e=>reportError(e.reason));
