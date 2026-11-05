import './style.css';
import {Battle,TICK} from './sim/battle';
import {sampleFleet,specs} from './sim/catalogue';
import type {BattleConfig,Fleet,Side} from './sim/types';
import {View2D} from './render/view2d';
import {View3D} from './render/view3d';
import {BattleAudio} from './render/audio';
const $=(selector:string)=>document.querySelector<HTMLElement>(selector)!;
const fmt=(n:number)=>n.toLocaleString('en-GB');
const timeText=(time:number)=>`${String(Math.floor(time/60)).padStart(2,'0')}:${String(Math.floor(time%60)).padStart(2,'0')}`;
const defaultPreset='sol';
let {a,b}=sampleFleet(defaultPreset);let seed=42;
let sim:Battle|null=null,playing=false,selected:number|null=null,speed=1,follow=false,mode:'2d'|'3d'='3d';
let view:View2D|View3D|null=null,accum=0,last=0,lastHud=0,ending=false;
const audio=new BattleAudio();
const app=document.getElementById('app')!;
app.innerHTML=`
  <header class="app-header">
    <div class="identity"><span class="identity-kicker">MASS EFFECT · FAN SANDBOX</span><strong>REAPER WAR <em>/</em> SPECTATOR</strong></div>
    <span class="header-caption">AUTONOMOUS FLEET COMBAT <span class="tiny-dot">◆</span> NO COMMAND ORDERS</span>
    <div class="header-actions"><span class="top-status" id="top-status"><i></i> READY</span><button id="audio" class="flat-btn">◖ AUDIO OFF</button></div>
  </header>
  <div class="layout">
    <aside class="left-pane pane">
      <div class="pane-title"><span>01</span> BATTLE SETUP</div>
      <label class="field-label" for="scenario">SCENARIO PRESET</label>
      <select id="scenario"><option value="sol">SOL DEFENCE — FIRST WAVE</option><option value="cerberus">BLACK FLEET INTERCEPTION</option><option value="duel">NOVA / SOVEREIGN DUEL</option><option value="battleline">ALLIANCE BATTLE LINE</option><option value="armada">FLEET ARMADA — LARGE</option></select>
      <div class="setup-subrow"><label for="seed">SEED</label><input id="seed" type="number" value="42" min="1" max="2147483647"/><span class="micro-text">REPEATABLE</span></div>
      <div class="fleet-tabs" role="tablist"><button class="fleet-tab active" data-side="A">SIDE A <span id="count-a"></span></button><button class="fleet-tab" data-side="B">SIDE B <span id="count-b"></span></button></div>
      <div id="fleet-editor" class="fleet-editor"></div>
      <div class="setup-footer"><div class="info-inline">Fleet composition only. Ships choose their own targets, weapons and movements.</div><button id="launch" class="primary-btn">▶ LAUNCH BATTLE</button></div>
    </aside>
    <main class="stage-wrap">
      <div class="stage-toolbar">
        <div class="mode-buttons"><button id="mode2d" class="active">2D TACTICAL CAMERA</button><button id="mode3d">3D CINEMATIC CAMERA</button></div>
        <div class="play-buttons"><button id="pause" title="Pause/resume">Ⅱ PAUSE</button><select id="speed" title="Simulation speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select><button id="restart" title="Restart current battle">↻</button></div>
      </div>
      <div class="stage" id="stage"><div class="crosshair">+</div><div class="stage-title"><span class="eyebrow">OBSERVATION CHANNEL</span><strong id="battle-name">DEFENCE OF SOL</strong><span class="subtext">FULLY AUTONOMOUS ENGAGEMENT</span></div>
        <div class="stage-help" id="stage-help">DRAG TO PAN · SCROLL TO ZOOM · CLICK A SHIP TO INSPECT</div>
        <div class="stage-bottom"><div class="timing"><span>BATTLE TIME</span><strong id="clock">00:00</strong></div><div class="status-central" id="battle-status">AWAITING DEPLOYMENT</div><div class="status-key"><span><i class="blue"></i> SIDE A</span><span><i class="red"></i> SIDE B</span></div></div>
      </div>
      <div class="bottom-strip"><span>SIMULATION: FIXED 30 HZ</span><span id="model-status">ORIGINAL GLB HULLS · GPU INSTANCED</span><span>SIM TIME = REPLAYABLE</span></div>
    </main>
    <aside class="right-pane pane">
      <div class="pane-title"><span>02</span> BATTLE TELEMETRY</div>
      <div class="stat-side"><div class="stat-title stat-blue">SIDE A <strong id="alive-a">—</strong></div><div class="progress-track"><div id="bar-a" class="progress-bar a"></div></div><div class="stat-line"><span>SHIPS LOST</span><strong id="lost-a">—</strong></div><div class="stat-line"><span>CAPITAL LOSSES</span><strong id="cap-a">—</strong></div><div class="stat-line"><span>DAMAGE DEALT</span><strong id="dmg-a">—</strong></div></div>
      <div class="stat-side"><div class="stat-title stat-red">SIDE B <strong id="alive-b">—</strong></div><div class="progress-track"><div id="bar-b" class="progress-bar b"></div></div><div class="stat-line"><span>SHIPS LOST</span><strong id="lost-b">—</strong></div><div class="stat-line"><span>CAPITAL LOSSES</span><strong id="cap-b">—</strong></div><div class="stat-line"><span>DAMAGE DEALT</span><strong id="dmg-b">—</strong></div></div>
      <div class="pane-title second"><span>03</span> CONTACT INSPECTION</div>
      <div id="selected" class="selected-panel"><span class="muted">Select any vessel in either view to see its condition, weaponry and kills.</span></div>
      <button id="follow" class="flat-btn full" disabled>◎ FOLLOW SELECTED VESSEL</button>
      <div class="pane-title second"><span>04</span> BATTLE LOG</div>
      <div id="battle-log" class="event-log"><div class="log-placeholder">Telemetry will appear here after launch.</div></div>
    </aside>
  </div>
  <footer class="site-foot">INDEPENDENT, UNOFFICIAL FAN PROJECT · ORIGINAL GAME CONTENT NOT INCLUDED · BUILD 0.2.0</footer>
`;
const state={currentSide:'A' as Side};
const editor=$('#fleet-editor');
const tally=(fleet:Fleet)=>Object.values(fleet).reduce((sum,n)=>sum+Number(n||0),0);
function escapeHtml(txt:string){return txt.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
function editFleet(){
  const fleet=state.currentSide==='A'?a:b;
  editor.innerHTML='';
  let lastFaction='';
  for(const spec of specs){
    if(spec.faction!==lastFaction){lastFaction=spec.faction;const h=document.createElement('div');h.className='faction-heading';h.textContent=spec.faction.toUpperCase();editor.append(h);}
    const row=document.createElement('label');row.className='fleet-row';row.title=spec.description;
    row.innerHTML=`<span><strong>${escapeHtml(spec.name)}</strong><small>${spec.role.toUpperCase()}</small></span><input type="number" min="0" max="1000" step="1" value="${fleet[spec.id]??0}" aria-label="${escapeHtml(spec.name)} count" />`;
    const input=row.querySelector('input')!;input.addEventListener('input',()=>{fleet[spec.id]=Math.max(0,Math.min(1000,Math.floor(Number(input.value)||0)));updateTally();});editor.append(row);
  }
  updateTally();
}
function updateTally(){$('#count-a').textContent=fmt(tally(a));$('#count-b').textContent=fmt(tally(b));}
for(const btn of document.querySelectorAll<HTMLButtonElement>('.fleet-tab'))btn.addEventListener('click',()=>{
  state.currentSide=btn.dataset.side as Side;
  document.querySelectorAll('.fleet-tab').forEach(el=>el.classList.toggle('active',el===btn));editFleet();
});
$('#scenario').addEventListener('change',e=>{const v=(e.target as HTMLSelectElement).value;({a,b}=sampleFleet(v));editFleet();$('#battle-name').textContent=(e.target as HTMLSelectElement).selectedOptions[0].textContent||'BATTLE';});
$('#seed').addEventListener('change',e=>{seed=Math.max(1,Math.floor(Number((e.target as HTMLInputElement).value)||42));});
const stage=$('#stage');
function createView(){view?.destroy();view=mode==='2d'?new View2D(stage):new View3D(stage,t=>$('#model-status').textContent=t);
  view.onSelect=id=>{selected=id;follow=false;if(view instanceof View3D)view.setSelected(id);updateSelected();};
  if(sim)view.setBattle(sim);
  if(view instanceof View2D)view.selected=selected;
  if(view instanceof View3D)view.setSelected(selected);
  $('#mode2d').classList.toggle('active',mode==='2d');$('#mode3d').classList.toggle('active',mode==='3d');
  $('#stage-help').textContent=mode==='2d'?'DRAG TO PAN · SCROLL TO ZOOM · CLICK TO INSPECT':'DRAG TO ORBIT · WHEEL TO ZOOM · RIGHT DRAG TO PAN · CLICK TO INSPECT';
}
function launch(){
  try{const config:BattleConfig={a:{...a},b:{...b},seed};sim=new Battle(config);selected=null;follow=false;accum=0;ending=false;playing=true;audio.reset();
    if(!view)createView();else view.setBattle(sim);
    $('#top-status').innerHTML='<i></i> LIVE';$('#battle-status').textContent='ENGAGEMENT IN PROGRESS';$('#pause').textContent='Ⅱ PAUSE';$('#launch').textContent='↻ REDEPLOY FLEETS';
    $('#model-status').textContent='ORIGINAL GLB HULLS · GPU INSTANCED';updateHud();updateSelected();
  }catch(err){$('#battle-status').textContent=err instanceof Error?err.message:'Could not start battle';}
}
$('#launch').addEventListener('click',launch);
$('#restart').addEventListener('click',launch);
$('#pause').addEventListener('click',()=>{if(!sim||sim.ended)return;playing=!playing;$('#pause').textContent=playing?'Ⅱ PAUSE':'▶ RESUME';$('#top-status').innerHTML=playing?'<i></i> LIVE':'<i></i> PAUSED';});
$('#speed').addEventListener('change',e=>{speed=Number((e.target as HTMLSelectElement).value)||1;});
$('#mode2d').addEventListener('click',()=>{if(mode!=='2d'){mode='2d';createView();}});
$('#mode3d').addEventListener('click',()=>{if(mode!=='3d'){mode='3d';createView();}});
$('#audio').addEventListener('click',()=>{audio.setEnabled(!audio.enabled);$('#audio').textContent=audio.enabled?'◖ AUDIO ON':'◖ AUDIO OFF';});
$('#follow').addEventListener('click',()=>{if(selected===null||!sim)return;follow=!follow;if(view instanceof View3D)view.follow(follow?selected:null);if(view instanceof View2D&&follow)view.follow(sim.ships[selected]);$('#follow').textContent=follow?'◎ FOLLOWING · RELEASE':'◎ FOLLOW SELECTED VESSEL';});
function updateSelected(){const box=$('#selected'),btn=$('#follow');btn.toggleAttribute('disabled',selected===null||!sim);
  if(selected===null||!sim){box.innerHTML='<span class="muted">Select any vessel in either view to see its condition, weaponry and kills.</span>';return;}
  const s=sim.ships[selected];if(!s)return;
  const hp=Math.max(0,100*s.hp/s.spec.hp),shield=Math.max(0,100*s.shield/s.spec.shield);
  box.innerHTML=`<div class="ship-header"><span class="ship-faction ${s.side==='A'?'a':'b'}">SIDE ${s.side}</span><span class="ship-condition">${s.alive?'ACTIVE':'DESTROYED'}</span></div><h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.spec.name)}</p><div class="health-label"><span>HULL</span><strong>${Math.round(hp)}%</strong></div><div class="health-track"><i style="width:${hp}%"></i></div><div class="health-label"><span>BARRIERS</span><strong>${Math.round(shield)}%</strong></div><div class="health-track shields"><i style="width:${shield}%"></i></div><div class="ship-metadata">KILLS <strong>${s.kills}</strong> · RANGE <strong>${Math.max(...s.spec.weapons.map(w=>w.range))}u</strong></div><div class="ship-weapons">${s.spec.weapons.map(w=>`<span>${escapeHtml(w.name)}</span>`).join('')}</div>`;
}
function updateHud(){if(!sim)return;
  $('#clock').textContent=timeText(sim.time);
  for(const side of ['A','B'] as Side[]){const t=side.toLowerCase(),st=sim.stats(side);$(`#alive-${t}`).textContent=`${fmt(sim.live(side))} / ${fmt(st.deployed)}`;
    $(`#lost-${t}`).textContent=fmt(st.destroyed);$(`#cap-${t}`).textContent=fmt(st.capitalsLost);$(`#dmg-${t}`).textContent=fmt(st.damageDone);
    ($(`#bar-${t}`) as HTMLElement).style.width=`${sim.percent(side).toFixed(1)}%`;
  }
  const log=$('#battle-log');log.innerHTML=sim.events.slice(0,35).map(ev=>`<div class="log-entry ${ev.kind==='kill'?(ev.side==='A'?'log-blue':'log-red'):''}"><span>${timeText(ev.time)}</span>${escapeHtml(ev.message)}</div>`).join('');
  updateSelected();
  if(sim.ended&&!ending){ending=true;playing=false;$('#top-status').innerHTML='<i></i> COMPLETE';$('#battle-status').textContent=sim.winner?`SIDE ${sim.winner} VICTORIOUS`:'ENGAGEMENT ENDED';$('#pause').textContent='▶ RESUME';}
}
function frame(t:number){const dt=Math.min(.12,(t-last)/1000||0);last=t;
  if(sim&&playing&&!sim.ended){accum=Math.min(accum+dt*speed,TICK*400);let i=0;while(accum>=TICK&&i<400){sim.step();accum-=TICK;i++;if(sim.ended)break;}audio.sync(sim);}
  if(sim&&view){if(view instanceof View2D){view.selected=selected;view.draw(sim);if(follow&&selected!==null&&sim.ships[selected]?.alive)view.follow(sim.ships[selected]);}
    else {if(follow&&selected!==null)view.follow(selected);view.draw(sim);}}
  if(t-lastHud>220){lastHud=t;updateHud();}requestAnimationFrame(frame);
}
editFleet();createView();launch();requestAnimationFrame(frame);
window.addEventListener('beforeunload',()=>{audio.dispose();view?.destroy();});
