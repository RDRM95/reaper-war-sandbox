import type {Battle} from '../sim/battle';
import type {Ship, WeaponKind} from '../sim/types';
import {RNG} from '../sim/rng';
import {silhouetteProfile} from './silhouettes';
const colors:Record<WeaponKind,string>={mac:'#71c8ff',beam:'#ff435d',missile:'#e5a16b',hades:'#ffb454',nova:'#f7e7ba',point:'#7bd4ff'};
const factionColors={alliance:'#9acbe2',cerberus:'#d2d9e1',reaper:'#a04450'};
interface Star {x:number;y:number;r:number;a:number}
export class View2D {
  readonly canvas:HTMLCanvasElement;private ctx:CanvasRenderingContext2D;
  private stars:Star[]=[];private zoom=1;private panX=0;private panY=0;
  private drag:{x:number;y:number;startX:number;startY:number;panX:number;panY:number}|null=null;
  selected:number|null=null;
  onSelect:(id:number|null)=>void=()=>{};
  private sim:Battle|null=null;
  constructor(container:HTMLElement){
    const canvas=document.createElement('canvas');canvas.className='battle-canvas';canvas.setAttribute('aria-label','2D orbital fleet battle spectator view');
    container.append(canvas);this.canvas=canvas;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');this.ctx=ctx;
    const rng=new RNG(1848);for(let i=0;i<900;i++)this.stars.push({x:rng.between(-1.7,1.7),y:rng.between(-1.5,1.5),r:rng.between(.4,1.8),a:rng.between(.08,.85)});
    canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);this.drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,panX:this.panX,panY:this.panY};});
    canvas.addEventListener('pointermove',e=>{if(!this.drag)return;this.panX=this.drag.panX+(e.clientX-this.drag.x);this.panY=this.drag.panY+(e.clientY-this.drag.y);});
    canvas.addEventListener('pointerup',e=>{if(!this.drag)return;const moved=Math.hypot(e.clientX-this.drag.startX,e.clientY-this.drag.startY);this.drag=null;if(moved<6)this.pick(e);});
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.35,Math.min(4,this.zoom*Math.exp(-e.deltaY*.001)));},{passive:false});
  }
  setBattle(battle:Battle){this.sim=battle;this.zoom=1;this.panX=0;this.panY=0;this.selected=null;}
  private dims(){const rect=this.canvas.getBoundingClientRect();const dpr=Math.min(2,window.devicePixelRatio||1);if(this.canvas.width!==Math.round(rect.width*dpr)||this.canvas.height!==Math.round(rect.height*dpr)){this.canvas.width=Math.max(1,Math.round(rect.width*dpr));this.canvas.height=Math.max(1,Math.round(rect.height*dpr));}return {w:rect.width,h:rect.height,dpr};}
  private screen(x:number,y:number,w:number,h:number){const scale=Math.min(w/1640,h/970)*this.zoom;return {x:w/2+x*scale+this.panX,y:h/2+y*scale+this.panY,scale};}
  private pick(e:PointerEvent){if(!this.sim)return;const r=this.canvas.getBoundingClientRect(),w=r.width,h=r.height;let best:number|null=null,close=22;
    for(const ship of this.sim.ships){if(!ship.alive)continue;const p=this.screen(ship.x,ship.y,w,h);const d=Math.hypot(e.clientX-r.left-p.x,e.clientY-r.top-p.y);if(d<close){close=d;best=ship.id;}}
    this.selected=best;this.onSelect(best);
  }
  follow(ship:Ship|null){if(!ship)return;const {w,h}=this.dims();const p=this.screen(ship.x,ship.y,w,h);this.panX+=w/2-p.x;this.panY+=h/2-p.y;}
  draw(sim:Battle){this.sim=sim;const {w,h,dpr}=this.dims();const ctx=this.ctx;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const bg=ctx.createRadialGradient(w*.52,h*.44,30,w*.5,h*.5,Math.max(w,h)*.78);bg.addColorStop(0,'#0b1c2b');bg.addColorStop(.62,'#06111f');bg.addColorStop(1,'#030711');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    for(const star of this.stars){ctx.fillStyle=`rgba(185,219,248,${star.a})`;ctx.beginPath();ctx.arc(w*.5+star.x*w*.42,h*.5+star.y*h*.42,star.r,0,Math.PI*2);ctx.fill();}
    const o=this.screen(0,0,w,h),step=100*o.scale;
    if(step>9){ctx.strokeStyle='rgba(68,130,178,.065)';ctx.lineWidth=1;for(let x=o.x%step;x<w;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=o.y%step;y<h;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}}
    // Battlespace is a view, never a movement-command interface.
    for(const shot of sim.shots){const s=this.screen(shot.sx,shot.sy,w,h),t=this.screen(shot.ex,shot.ey,w,h),f=Math.min(1,shot.age/shot.duration);ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle=colors[shot.kind];ctx.shadowColor=colors[shot.kind];ctx.shadowBlur=shot.kind==='nova'?28:shot.kind==='beam'?13:9;ctx.lineWidth=shot.kind==='nova'?4:shot.kind==='hades'?2.4:1.3;
      const a=Math.max(0,f-(shot.kind==='beam'?.82:.35)),b=Math.min(1,f+.08);
      ctx.beginPath();ctx.moveTo(s.x+(t.x-s.x)*a,s.y+(t.y-s.y)*a);ctx.lineTo(s.x+(t.x-s.x)*b,s.y+(t.y-s.y)*b);ctx.stroke();ctx.restore();}
    for(const ship of sim.ships){if(ship.alive)this.drawShip(ctx,ship,this.screen(ship.x,ship.y,w,h),sim.time);}
    for(const fx of sim.explosions){const p=this.screen(fx.x,fx.y,w,h),f=fx.age/fx.duration,r=(10+fx.size*f*1.3)*p.scale;ctx.save();ctx.globalCompositeOperation='lighter';const g=ctx.createRadialGradient(p.x,p.y,1,p.x,p.y,Math.max(r,1));g.addColorStop(0,`rgba(255,248,201,${.92*(1-f)})`);g.addColorStop(.26,`rgba(255,129,61,${.65*(1-f)})`);g.addColorStop(1,'rgba(255,61,31,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(r,1),0,Math.PI*2);ctx.fill();ctx.restore();}
    ctx.fillStyle='rgba(149,194,218,.6)';ctx.font='11px ui-monospace, monospace';ctx.fillText('ORBITAL CAMERA  //  AUTONOMOUS FLEET ENGAGEMENT',18,h-18);
    ctx.textAlign='right';ctx.fillText(`${Math.round(1/o.scale*100)} U / 100 PX`,w-18,h-18);ctx.textAlign='left';
  }
  private drawShip(ctx:CanvasRenderingContext2D,ship:Ship,p:{x:number;y:number;scale:number},t:number){
    const s=ship.spec,sz=Math.max(2,s.size*p.scale*.73);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(ship.heading);ctx.scale(sz,sz);
    const fill=factionColors[s.faction];ctx.lineJoin='round';ctx.strokeStyle=s.faction==='reaper'?'#ee5a6a':'#a4d2ec';ctx.lineWidth=.11;
    ctx.fillStyle=fill;
    const poly=(pts:number[][])=>{ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(const [x,y] of pts.slice(1))ctx.lineTo(x,y);ctx.closePath();ctx.fill();ctx.stroke();};
    const profile=silhouetteProfile(s.silhouette);
    poly(profile.main);
    ctx.fillStyle=s.faction==='reaper'?'#352432':s.faction==='cerberus'?'#75889b':'#7e9cae';
    for(const hull of profile.appendages)poly(hull);
    ctx.fillStyle=s.faction==='reaper'?'#54313a':s.faction==='cerberus'?'#283545':'#34516c';
    poly(profile.spine);
    for(const [ex,ey] of profile.engines){
      ctx.beginPath();ctx.fillStyle=s.faction==='reaper'?'#e54c56':'#78caff';ctx.shadowColor=ctx.fillStyle;
      ctx.shadowBlur=8;ctx.ellipse(ex,ey,.10,.085,0,0,2*Math.PI);ctx.fill();ctx.shadowBlur=0;
    }
    ctx.restore();
    if(ship.id===this.selected){ctx.beginPath();ctx.arc(p.x,p.y,Math.max(11,sz*2.6),0,Math.PI*2);ctx.strokeStyle='#e3c37c';ctx.lineWidth=1.2;ctx.setLineDash([5,5]);ctx.stroke();ctx.setLineDash([]);}
    if(s.role==='capital'||ship.id===this.selected){ctx.fillStyle=ship.side==='A'?'#a3d9ff':'#ff9da6';ctx.font='10px ui-monospace, monospace';ctx.textAlign='center';ctx.fillText(ship.name,p.x,p.y+Math.max(14,sz*1.8));ctx.textAlign='left';}
    void t;
  }
  destroy(){this.canvas.remove();}
}
