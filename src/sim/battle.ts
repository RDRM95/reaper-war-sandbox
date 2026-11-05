import {byId} from './catalogue';
import {RNG} from './rng';
import type {BattleConfig, BattleEvent, BattleStats, Explosion, Ship, ShipSpec, Shot, Side, Weapon} from './types';
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const dist=(a:Ship,b:Ship)=>Math.hypot(a.x-b.x,a.y-b.y);
const norm=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));
const strength=(s:Ship)=>s.spec.hp+s.spec.shield;
export const TICK=1/30;
export class Battle {
  readonly seed:number; readonly rng:RNG; readonly ships:Ship[]=[]; readonly shots:Shot[]=[];
  readonly explosions:Explosion[]=[]; readonly events:BattleEvent[]=[];
  readonly deployed:Record<Side,number>={A:0,B:0};
  readonly damage:Record<Side,number>={A:0,B:0};
  time=0; ended=false; winner:Side|null=null; tick=0;
  private nextShot=0;
  constructor(config:BattleConfig){
    this.seed=config.seed;this.rng=new RNG(config.seed);
    this.build('A',config.a);this.build('B',config.b);
    if(!this.deployed.A || !this.deployed.B)throw Error('Each side needs at least one ship.');
    this.log('start',`Battle commenced · ${this.deployed.A} against ${this.deployed.B}`);
  }
  private build(side:Side,fleet:Record<string,number>){
    const defs: ShipSpec[]=[];
    for(const [id,raw] of Object.entries(fleet)){
      const spec=byId.get(id);if(!spec)continue;
      for(let i=0;i<clamp(Math.floor(raw),0,1000);i++)defs.push(spec);
    }
    defs.sort((a,b)=>({capital:0,line:1,escort:2,fighter:3})[a.role]-({capital:0,line:1,escort:2,fighter:3})[b.role]);
    this.deployed[side]=defs.length;
    const sign=side==='A'?-1:1;
    const columns=Math.max(5,Math.ceil(Math.sqrt(defs.length)*1.6));
    const totalRows=Math.ceil(defs.length/columns);
    const roleCount:Record<string,number>={capital:0,line:0,escort:0,fighter:0};
    for(let i=0;i<defs.length;i++){
      const spec=defs[i]; const col=i%columns;const row=Math.floor(i/columns);
      const flank=col-(Math.min(columns,defs.length)-1)/2;
      const x=sign*(480+row*26+({capital:80,line:20,escort:-42,fighter:-75})[spec.role])+this.rng.between(-9,9);
      const y=flank*Math.max(23,spec.size*1.8)+this.rng.between(-7,7);
      const z=this.rng.between(-10,10)+({'capital':4,'line':0,'escort':-3,'fighter':-7})[spec.role];
      roleCount[spec.role]++;
      const ship:Ship={id:this.ships.length,spec,side,name:this.nameFor(spec,roleCount[spec.role]),x,y,z,
        heading:side==='A'?0:Math.PI,vx:0,vy:0,hp:spec.hp,shield:spec.shield,lastHit:-999,target:null,
        retargetAt:this.rng.between(0,1),ready:spec.weapons.map(()=>this.rng.between(.1,2.3)),wing:col%3,alive:true,kills:0};
      this.ships.push(ship);
    }
    void totalRows;
  }
  private nameFor(s:ShipSpec,index:number){
    const names=['Kilimanjaro','Olympus Mons','Mauna Kea','Arcturus','Hastings','Valiant','Orizaba','Pinnacle','Vigilant','Aegis','Dauntless','Concord','Wayfarer','Resolute','Helios','Prometheus'];
    if(s.id==='normandy')return 'SSV Normandy SR-2';
    if(s.id==='valkyrie')return 'SSV Normandy Valkyrie';
    if(s.id==='harbinger')return 'Harbinger';
    if(s.faction==='reaper')return `${s.name} ${String(index).padStart(2,'0')}`;
    return `${s.faction==='cerberus'?'CV':'SSV'} ${names[(index-1)%names.length]}${index>names.length?' '+index:''}`;
  }
  private log(kind:BattleEvent['kind'],message:string,side?:Side){
    this.events.unshift({kind,message,side,time:this.time});if(this.events.length>180)this.events.pop();
  }
  private selectTarget(ship:Ship,enemies:Ship[]){
    let best:Ship|null=null,score=Infinity;
    for(const target of enemies){
      if(!target.alive)continue;
      const d=dist(ship,target);
      // Groups distribute targets, but prefer nearby capital threats when capable of damaging them.
      const capital=target.spec.role==='capital'&&ship.spec.role==='capital'?.78:1;
      const wingAffinity=target.wing===ship.wing?.93:1;
      const rating=d*capital*wingAffinity*(1+this.rng.next()*.045);
      if(rating<score){score=rating;best=target;}
    }
    ship.target=best?.id??null;ship.retargetAt=this.time+this.rng.between(.9,2.0);
  }
  private fire(ship:Ship,target:Ship,weapon:Weapon){
    const d=dist(ship,target), hitChance=clamp(.95-(d/weapon.range)*.20-(target.spec.speed>30?.07:0),.55,.98);
    const hit=this.rng.next()<hitChance;
    const variation=this.rng.between(.86,1.14);
    const impact=weapon.damage*variation;
    this.shots.push({id:this.nextShot++,sx:ship.x,sy:ship.y,sz:ship.z,ex:target.x+(hit?0:this.rng.between(-35,35)),ey:target.y+(hit?0:this.rng.between(-35,35)),ez:target.z,
      age:0,duration:weapon.kind==='beam'?.32:weapon.kind==='nova'?.48:weapon.kind==='hades'?.58:.34,
      kind:weapon.kind,side:ship.side,sourceId:ship.id,targetId:target.id});
    if(this.shots.length>950)this.shots.splice(0,this.shots.length-950);
    if(!hit)return;
    const pierce=weapon.pierce??0;
    const shieldHit=impact*(1-pierce)*(weapon.shieldMult??1);
    const shieldBefore=target.shield;
    target.shield=Math.max(0,target.shield-shieldHit);
    const overflow=Math.max(0,shieldHit-shieldBefore)/(weapon.shieldMult??1);
    const hullDamage=impact*pierce+overflow;
    target.hp=Math.max(0,target.hp-hullDamage);
    target.lastHit=this.time;
    this.damage[ship.side]+=Math.min(shieldBefore,shieldHit)+Math.min(target.hp+hullDamage,hullDamage);
    if(target.hp<=0){
      target.alive=false;target.hp=0;ship.kills++;
      this.explosions.push({x:target.x,y:target.y,z:target.z,age:0,duration:2.1,size:target.spec.size*2.6,side:target.side});
      if(this.explosions.length>300)this.explosions.shift();
      this.log('kill',`${target.name} destroyed by ${ship.name}`,ship.side);
    }
  }
  step(dt=TICK){
    if(this.ended)return;
    this.time+=dt;this.tick++;
    const living=this.ships.filter(s=>s.alive);
    const a=living.filter(s=>s.side==='A'),b=living.filter(s=>s.side==='B');
    if(!a.length||!b.length||this.time>=1200){
      this.ended=true;this.winner=a.length&&!b.length?'A':b.length&&!a.length?'B':null;
      this.log('finish',this.winner?`Fleet ${this.winner} victorious`:'Battle concluded');return;
    }
    for(const ship of living){
      const enemies=ship.side==='A'?b:a;
      if(ship.target===null||!this.ships[ship.target]?.alive||ship.retargetAt<=this.time)this.selectTarget(ship,enemies);
      const target=ship.target!==null?this.ships[ship.target]:null;
      if(!target)continue;
      const dx=target.x-ship.x,dy=target.y-ship.y,d=Math.hypot(dx,dy)||1;
      const wanted=Math.atan2(dy,dx);
      ship.heading+=clamp(norm(wanted-ship.heading),-dt*1.55,dt*1.55);
      const maxRange=Math.max(...ship.spec.weapons.map(w=>w.range));
      const desired=ship.spec.role==='fighter'?maxRange*.70:maxRange*.79;
      const forward=d>desired+25?1:d<desired-55?-.48:0;
      const flank=ship.wing===0?-.19:ship.wing===2?.19:0;
      const ux=dx/d,uy=dy/d;
      const demandX=(ux*forward-uy*flank)*ship.spec.speed;
      const demandY=(uy*forward+ux*flank)*ship.spec.speed;
      const inertia=Math.min(1,dt*1.5);
      ship.vx+=(demandX-ship.vx)*inertia;ship.vy+=(demandY-ship.vy)*inertia;
      ship.x+=ship.vx*dt;ship.y+=ship.vy*dt;
      if(this.time-ship.lastHit>5.5)ship.shield=Math.min(ship.spec.shield,ship.shield+ship.spec.shieldRegen*dt);
      for(let wi=0;wi<ship.spec.weapons.length;wi++){
        if(ship.ready[wi]>this.time)continue;
        const w=ship.spec.weapons[wi];
        if(d>w.range)continue;
        const arc=Math.abs(norm(wanted-ship.heading));
        if(arc>(w.kind==='point'?Math.PI*.92:Math.PI*.42))continue;
        // Weapons schedule from absolute simulation time, independent of frame rate.
        ship.ready[wi]=this.time+w.cooldown*(.92+.16*this.rng.next());
        this.fire(ship,target,w);
        if(!target.alive)break;
      }
    }
    for(let i=this.shots.length-1;i>=0;i--){this.shots[i].age+=dt;if(this.shots[i].age>=this.shots[i].duration)this.shots.splice(i,1);}
    for(let i=this.explosions.length-1;i>=0;i--){this.explosions[i].age+=dt;if(this.explosions[i].age>=this.explosions[i].duration)this.explosions.splice(i,1);}
  }
  stats(side:Side):BattleStats{
    const ships=this.ships.filter(s=>s.side===side);
    return {deployed:ships.length,destroyed:ships.filter(s=>!s.alive).length,capitalsLost:ships.filter(s=>!s.alive&&s.spec.role==='capital').length,damageDone:Math.round(this.damage[side])};
  }
  live(side:Side):number{return this.ships.reduce((n,s)=>n+(s.alive&&s.side===side?1:0),0);}
  percent(side:Side):number{
    const ships=this.ships.filter(s=>s.side===side);if(!ships.length)return 0;
    return 100*ships.reduce((v,s)=>v+(s.alive?(s.hp+s.shield)/strength(s):0),0)/ships.length;
  }
  hash():string{
    return JSON.stringify({time:Math.round(this.time*1000),winner:this.winner,ships:this.ships.map(s=>[s.id,s.alive,Math.round(s.hp),Math.round(s.shield),Math.round(s.x),Math.round(s.y)])});
  }
}
export function runToEnd(config:BattleConfig,maxTicks=36000):Battle{
  const b=new Battle(config);for(let i=0;i<maxTicks&&!b.ended;i++)b.step();return b;
}
