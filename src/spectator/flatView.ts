import type { BattleSimulation } from '@/simulation/battle';
import type { ShipState } from '@/simulation/types';

/** Lightweight Stellaris-style top-down spectator. The ORIGINAL simulation remains authoritative. */
export class FleetMap2D {
  private ctx: CanvasRenderingContext2D;
  private scale = 1;
  private centreX = 0;
  private centreZ = 0;
  private zoom = 1;
  private dragging: { x:number; y:number; cx:number; cz:number; moved:boolean } | null = null;
  private stars: {x:number;y:number;r:number}[] = [];
  selected?: string;
  onPick?: (ship:ShipState|undefined) => void;
  constructor(readonly canvas:HTMLCanvasElement) {
    const ctx=canvas.getContext('2d'); if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx=ctx;
    let seed=0x17acb45;
    for(let i=0;i<540;i++) {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=(seed/4294967296);
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;const y=(seed/4294967296);
      this.stars.push({x,y,r:i%9===0?1.5:.65});
    }
    canvas.addEventListener('pointerdown',e=>{ canvas.setPointerCapture(e.pointerId);this.dragging={x:e.clientX,y:e.clientY,cx:this.centreX,cz:this.centreZ,moved:false};});
    canvas.addEventListener('pointermove',e=>{if(!this.dragging)return;const d=this.dragging;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>5)d.moved=true;this.centreX=d.cx-(e.clientX-d.x)/this.scale;this.centreZ=d.cz-(e.clientY-d.y)/this.scale;});
    canvas.addEventListener('pointerup',e=>{if(!this.dragging)return;const moved=this.dragging.moved;this.dragging=null;if(!moved)this.pick(e);});
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.25,Math.min(10,this.zoom*Math.exp(-e.deltaY*.0012)));},{passive:false});
  }
  private current?: BattleSimulation;
  reset(){this.centreX=0;this.centreZ=0;this.zoom=1;this.selected=undefined;}
  private dimensions(){const r=this.canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(1,r.width),h=Math.max(1,r.height);
    if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
    return {w,h,dpr};
  }
  private screen(x:number,z:number,w:number,h:number){return {x:w*.5+(x-this.centreX)*this.scale,y:h*.5+(z-this.centreZ)*this.scale};}
  private pick(e:PointerEvent){const sim=this.current;if(!sim)return;const r=this.canvas.getBoundingClientRect();
    const {w,h}=this.dimensions();let closest:ShipState|undefined;let best=18;
    for(const s of sim.ships){if(!s.alive||s.escaped)continue;const q=this.screen(s.pos.x,s.pos.z,w,h);const d=Math.hypot(q.x-(e.clientX-r.left),q.y-(e.clientY-r.top));if(d<best){best=d;closest=s;}}
    this.selected=closest?.id;this.onPick?.(closest);
  }
  focus(s:ShipState){this.centreX=s.pos.x;this.centreZ=s.pos.z;}
  draw(sim:BattleSimulation){this.current=sim;const {w,h,dpr}=this.dimensions(),c=this.ctx;c.setTransform(dpr,0,0,dpr,0,0);
    c.fillStyle='#030916';c.fillRect(0,0,w,h);
    for(const p of this.stars){c.fillStyle=p.r>1?'rgba(200,226,255,.65)':'rgba(130,177,219,.33)';c.fillRect(p.x*w,p.y*h,p.r,p.r);}
    const active=sim.ships.filter(s=>s.alive&&!s.escaped);
    // Distant large battles describe fleets. Individual hull detail returns
    // on selection or close zoom without changing the simulation or picking.
    const aggregate=active.length>160&&this.zoom<3;
    const fleets=new Map<string,{count:number;x:number;front:number;colour:string}>();
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const ship of active){
      minX=Math.min(minX,ship.pos.x);maxX=Math.max(maxX,ship.pos.x);
      minZ=Math.min(minZ,ship.pos.z);maxZ=Math.max(maxZ,ship.pos.z);
      if(aggregate){
        const group=fleets.get(ship.fleetId)??{count:0,x:0,front:Infinity,colour:ship.side==='A'?'#99cdeb':'#f0b489'};
        group.count++;group.x+=ship.pos.x;group.front=Math.min(group.front,ship.pos.z);
        if(ship.faction==='reaper')group.colour='#cf6673';
        fleets.set(ship.fleetId,group);
      }
    }
    const range=active.length?Math.max(140,maxX-minX+180,maxZ-minZ+180):200;
    this.scale=Math.min(w,h)*.9/range*this.zoom;
    const grid=50*this.scale;
    if(grid>20){c.strokeStyle='rgba(56,104,144,.12)';c.lineWidth=1;
      const o=this.screen(0,0,w,h);for(let x=((o.x%grid)+grid)%grid;x<w;x+=grid){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}
      for(let y=((o.y%grid)+grid)%grid;y<h;y+=grid){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}}
    for(const f of sim.flashes){const a=this.screen(f.from.x,f.from.z,w,h),b=this.screen(f.to.x,f.to.z,w,h);
      c.strokeStyle=f.kind==='reaper_pd'?'#ff4c57':'#96d8ff';c.lineWidth=1.4;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}
    for(const m of sim.missiles){if(!m.alive)continue;const q=this.screen(m.pos.x,m.pos.z,w,h);c.fillStyle='#ffc483';c.beginPath();c.arc(q.x,q.y,2.2,0,6.283);c.fill();}
    for(const p of sim.projectiles){const q=this.screen(p.pos.x,p.pos.z,w,h);
      c.fillStyle=p.weapon.damage>1000?'#fff0a8':'#91c9ed';c.beginPath();c.arc(q.x,q.y,p.weapon.damage>1000?3.4:1.7,0,6.283);c.fill();}
    // Spatially bucket labels: dense fleets no longer compare every capital label with every other label.
    const labels=new Map<string,{x:number;y:number;width:number}[]>();
    const labelCell=160;
    const labelKey=(x:number,y:number)=>x+','+y;
    const drawLabel=(label:string,lx:number,ly:number,colour:string,force=false):boolean=>{
      c.font='10px ui-monospace,monospace';
      const width=c.measureText(label).width;
      lx=Math.max(width*.5+5,Math.min(w-width*.5-5,lx));
      ly=Math.max(14,Math.min(h-32,ly));
      const cx=Math.floor(lx/labelCell),cy=Math.floor(ly/labelCell);
      if(!force)for(let dx=-2;dx<=2;dx++)for(let dy=-1;dy<=1;dy++){
        for(const other of labels.get(labelKey(cx+dx,cy+dy))??[])
          if(Math.abs(other.y-ly)<16&&Math.abs(other.x-lx)<(other.width+width)*.5+9)return false;
      }
      c.textAlign='center';c.fillStyle='rgba(3,9,22,.82)';c.fillRect(lx-width*.5-4,ly-7,width+8,14);
      c.fillStyle=colour;c.fillText(label,lx,ly);
      const key=labelKey(cx,cy),bucket=labels.get(key)??[];bucket.push({x:lx,y:ly,width});labels.set(key,bucket);
      return true;
    };
    for(const s of active){
      const q=this.screen(s.pos.x,s.pos.z,w,h);if(q.x < -48 || q.x > w+48 || q.y < -48 || q.y > h+48) continue;
      const capital=s.role==='dreadnought'||s.role==='carrier'||s.role==='reaper_capital';
      const selected=s.id===this.selected;
      const size=aggregate&&!selected
        ?Math.max(capital?1.8:1.1,Math.min(5.5,Math.sqrt(s.lengthKm)*this.scale*.55))
        :Math.max(capital?9:4.5,Math.min(31,Math.sqrt(s.lengthKm)*this.scale*2.3));
      const reaper=s.faction==='reaper';const colour=reaper?'#cf6673':s.side==='A'?'#99cdeb':'#f0b489';
      const angle=Math.atan2(s.heading.z,s.heading.x);
      c.save();c.translate(q.x,q.y);c.rotate(angle);
      c.fillStyle=reaper?'#703640':s.side==='A'?'#477a9b':'#846a4b';c.strokeStyle=colour;c.lineWidth=1.15;
      c.beginPath();
      if(reaper){c.moveTo(size,0);c.lineTo(size*.2,-size*.45);c.lineTo(-size*.75,-size*.5);c.lineTo(-size*.3,0);c.lineTo(-size*.75,size*.5);c.lineTo(size*.2,size*.45);}
      else{c.moveTo(size,0);c.lineTo(size*.2,-size*.23);c.lineTo(-size*.65,-size*.47);c.lineTo(-size*.92,-size*.30);c.lineTo(-size*.38,0);c.lineTo(-size*.92,size*.30);c.lineTo(-size*.65,size*.47);c.lineTo(size*.2,size*.23);}
      c.closePath();c.fill();c.stroke();c.restore();
      if((capital&&!aggregate)||selected)drawLabel(s.name,q.x,q.y+size+15,colour,selected);
      if(s.id===this.selected){c.strokeStyle='#f6cd7c';c.setLineDash([4,4]);c.beginPath();c.arc(q.x,q.y,size+7,0,6.283);c.stroke();c.setLineDash([]);}
      if(s.barriers>0&&capital&&(!aggregate||selected)){c.strokeStyle=s.side==='A'?'rgba(76,172,255,.24)':'rgba(248,83,110,.24)';c.beginPath();c.arc(q.x,q.y,size+3,0,6.283);c.stroke();}
    }
    if(aggregate)for(const [id,group]of fleets){
      const fleet=sim.fleets.get(id);
      const name=fleet?.spec.name??id;
      const label=(name.length>36?name.slice(0,33)+'…':name).toUpperCase()+' · '+group.count+' SHIPS';
      const q=this.screen(group.x/group.count,group.front,w,h);
      if(q.x < -250||q.x > w+250||q.y < -80||q.y > h+80)continue;
      for(const offset of [-18,-36,-54,12,30])if(drawLabel(label,q.x,q.y+offset,group.colour))break;
    }
    c.textAlign='left';c.fillStyle='#80abc8';c.font='11px ui-monospace,monospace';c.fillText('ORBITAL TRACKING · 2D SPECTATOR',16,h-20);
  }
}
