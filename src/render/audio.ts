import type {Battle} from '../sim/battle';
import type {WeaponKind} from '../sim/types';

/** Original procedural cues, composed from filtered noise and pitched synthesis.
 * No Mass Effect audio samples or licensed music are included.
 * Important: audio never feeds back into the deterministic simulation. */
export class BattleAudio {
  enabled=false;
  private ctx:AudioContext|null=null;
  private master:GainNode|null=null;
  private noiseBuffer:AudioBuffer|null=null;
  private lastId=-1;
  private lastSound=0;
  setEnabled(enabled:boolean){
    this.enabled=enabled;
    if(enabled){
      this.ctx??=new AudioContext();
      void this.ctx.resume();
      if(!this.master){
        this.master=this.ctx.createGain();this.master.gain.value=.33;
        const limiter=this.ctx.createDynamicsCompressor();
        limiter.threshold.value=-16;limiter.knee.value=22;limiter.ratio.value=8;
        this.master.connect(limiter);limiter.connect(this.ctx.destination);
      }
      if(!this.noiseBuffer){
        const sampleRate=this.ctx.sampleRate;
        const buf=this.ctx.createBuffer(1,sampleRate,sampleRate);
        const samples=buf.getChannelData(0);
        // Deterministic static noise palette for weapon transients (not sim RNG).
        let state=0x12345678;
        for(let i=0;i<samples.length;i++){
          state^=state<<13;state^=state>>>17;state^=state<<5;
          samples[i]=((state>>>0)/0xffffffff)*2-1;
        }
        this.noiseBuffer=buf;
      }
    }
  }
  reset(){this.lastId=-1;this.lastSound=0;}
  private tone(t:number,from:number,to:number,duration:number,amp:number,type:OscillatorType='sine'){
    if(!this.ctx||!this.master)return;
    const osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
    osc.type=type;
    osc.frequency.setValueAtTime(Math.max(25,from),t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(25,to),t+duration);
    gain.gain.setValueAtTime(.0001,t);
    gain.gain.exponentialRampToValueAtTime(amp,t+.018);
    gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    osc.connect(gain);gain.connect(this.master);
    osc.start(t);osc.stop(t+duration+.02);
  }
  private noise(t:number,duration:number,amp:number,cutoff:number){
    if(!this.ctx||!this.master||!this.noiseBuffer)return;
    const source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();
    source.buffer=this.noiseBuffer;filter.type='lowpass';filter.frequency.value=cutoff;
    gain.gain.setValueAtTime(.0001,t);
    gain.gain.exponentialRampToValueAtTime(amp,t+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.connect(filter);filter.connect(gain);gain.connect(this.master);
    source.start(t);source.stop(t+duration+.025);
  }
  private cue(kind:WeaponKind,t:number){
    // Distinct near-field character: kinetic impulse, Reaper beam, nuclear penetrator, NOVA.
    switch(kind){
      case 'nova':
        this.tone(t,540,110,.52,.15,'sawtooth');
        this.tone(t+.05,120,36,.77,.23,'triangle');
        this.noise(t+.06,.42,.23,1400);
        break;
      case 'hades':
        this.tone(t,220,52,.39,.19,'triangle');
        this.noise(t,.20,.16,1700);break;
      case 'beam':
        this.tone(t,175,83,.48,.095,'sawtooth');
        this.tone(t+.04,68,37,.33,.085,'sine');break;
      case 'mac':
        this.tone(t,105,42,.27,.15,'triangle');
        this.noise(t,.095,.10,1100);break;
      case 'missile':
        this.tone(t,430,145,.26,.07,'sawtooth');
        this.noise(t+.025,.12,.06,950);break;
      case 'point':
        this.tone(t,370,180,.12,.035,'square');break;
    }
  }
  sync(battle:Battle){
    if(!this.enabled||!this.ctx)return;
    const newest=battle.shots.reduce((m,s)=>Math.max(m,s.id),this.lastId);
    if(newest<=this.lastId)return;
    const candidates=battle.shots.filter(s=>s.id>this.lastId);
    this.lastId=newest;
    const now=this.ctx.currentTime;
    // Avoid dozens of overlapping sounds when 1,000+ ships fire simultaneously.
    if(now-this.lastSound<.095)return;
    const priority:WeaponKind[]=['nova','hades','beam','mac','missile','point'];
    const shot=priority.map(kind=>candidates.find(s=>s.kind===kind)).find(Boolean);
    if(!shot)return;
    this.lastSound=now;this.cue(shot.kind,now);
  }
  dispose(){void this.ctx?.close();this.ctx=null;this.master=null;this.noiseBuffer=null;}
}
