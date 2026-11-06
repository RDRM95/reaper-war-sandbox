import type { FactionId } from '@/data/types';
import type { TechModifiers } from '@/timelines/rules';
import type { Environment, FormationType } from '@/simulation/types';

/** Hand-authored AU missions. Their hull counts and history are fictional,
 * labelled explicitly rather than passed off as franchise canon. */
export interface ExpandedBattle {
  id:string; name:string; subtitle:string; era:string; description:string;
  rules:string; environment:Environment; distance:number; maxDuration:number;
  objective:string; mathRecommended?:boolean;
  a:{faction:FactionId;name:string;formation:FormationType;counts:Record<string,number>;tech?:Partial<TechModifiers>};
  b:{faction:FactionId;name:string;formation:FormationType;counts:Record<string,number>;tech?:Partial<TechModifiers>};
}
export const EXPANDED_BATTLES:ExpandedBattle[]=[
  {
    id:'axiom_reckoning',name:'Axiom’s Reckoning',subtitle:'A dissident Reaper faces its former masters',
    era:'2194 CE · Apex AU',description:'Axiom leads its sentinel guard against an aggressive Reaper spearhead while organic survivors flee the system.',
    rules:'prime_apex',environment:'earth_orbit',distance:95,maxDuration:460,
    objective:'Hold the escape corridor and disable the harvest spearhead.',
    a:{faction:'axiom_guard',name:'Axiom Guard',formation:'strike_wedge',tech:{beamDamage:1.16,sensors:1.35,kineticBarrierStrength:1.12},counts:{axiom_ancient:1,axiom_warden:16}},
    b:{faction:'reaper',name:'Harbinger’s execution detail',formation:'capital_column',counts:{reaper_capital:9,reaper_destroyer:32}}
  },
  {
    id:'exiles_homecoming',name:'The Exiles Return',subtitle:'Previous-cycle refugees claim ancestral Citadel territory',
    era:'3000 CE · Frontier AU',description:'Generations after the Reaper War, the Exile Hegemony arrives with old war-arks and demands control of Citadel-aligned systems.',
    rules:'prime_apex',environment:'relay',distance:145,maxDuration:560,
    objective:'Prevent the Exile Hegemony from controlling the relay corridor.',
    a:{faction:'alliance',name:'Post-war Alliance defence group',formation:'line_abreast',
      counts:{alliance_omaha:2,alliance_dreadnought:12,alliance_cruiser:34,alliance_frigate_thanix:18}},
    b:{faction:'exile_hegemony',name:'Exile ancestral reclamation fleet',formation:'strike_wedge',tech:{beamDamage:1.2,accuracy:1.1,sensors:1.18},
      counts:{exile_ark:9,exile_raider:58}}
  },
  {
    id:'terminus_concord',name:'Terminus Holds the Line',subtitle:'Aria’s frontier compact meets the Reapers',
    era:'2187 CE · Apex AU',description:'Batarian refugees, Terminus shipyards and Omega-backed warships concentrate their guns in a conventional defensive battle.',
    rules:'prime_apex',environment:'deep_space',distance:110,maxDuration:520,
    objective:'Deny passage to the Reaper harvest flotilla.',
    a:{faction:'terminus_compact',name:'Terminus Compact Battle Groups',formation:'defensive_screen',tech:{torpedoDamage:1.16,hullIntegrity:1.14},
      counts:{compact_siege:24,compact_gunship:160}},
    b:{faction:'reaper',name:'Reaper Terminus flotilla',formation:'capital_column',
      counts:{reaper_capital:10,reaper_destroyer:48}}
  },
  {
    id:'iron_sol',name:'Iron Sol — First Contact',subtitle:'An advanced human navy intercepts the Hierarchy',
    era:'2157 CE · Isolationist Humanity AU',description:'Humanity emerges from its fortified Sol system on its own terms, meeting a surprised turian expedition on neutral ground.',
    rules:'humanity_ascendant',environment:'relay',distance:90,maxDuration:480,
    objective:'Resolve the naval first-contact standoff.',
    a:{faction:'alliance',name:'Systems Alliance First Contact Force',formation:'line_abreast',tech:{massAcceleratorDamage:1.22,kineticBarrierStrength:1.24,fireRate:1.08},
      counts:{alliance_dreadnought:36,alliance_cruiser:125,alliance_frigate:190}},
    b:{faction:'turian',name:'Hierarchy border expedition',formation:'strike_wedge',
      counts:{turian_dreadnought:8,turian_cruiser:52,turian_frigate:95}}
  },
  {
    id:'apex_earth_massive',name:'APEX — Final Battle for Earth',subtitle:'A strategic-scale analytical theatre',
    era:'2195 CE · Nine Years of War',description:'Alliance and Reaper armadas collide in enormous numbers. Designed primarily for Instant Battle Results; running it in 3D is optional and expensive.',
    rules:'prime_apex',environment:'earth_orbit',distance:220,maxDuration:650,
    objective:'Break the Reaper fleet and preserve Earth.',
    mathRecommended:true,
    a:{faction:'alliance',name:'Combined Alliance Armada',formation:'line_abreast',tech:{accuracy:1.12,kineticBarrierStrength:1.2},
      counts:{alliance_omaha:6,alliance_valkyrie:1,alliance_dreadnought:95,alliance_cruiser:440,alliance_frigate:1250,alliance_carrier:40}},
    b:{faction:'reaper',name:'Harvest Armada',formation:'capital_column',
      counts:{harbinger:1,reaper_capital:90,reaper_destroyer:360}}
  },
  {
    id:'old_war',name:'Extinction Cycle — Lost War',subtitle:'Pre-Prothean resistance in deep space',
    era:'Millions of years before 2186 · Fictional previous cycle',
    description:'A past-cycle military stands against an approaching Reaper capital group with no knowledge of the Crucible.',
    rules:'multiverse_crossover',environment:'deep_space',distance:130,maxDuration:550,
    objective:'Measure the older civilisation’s endurance against the harvest.',
    a:{faction:'past_cycle',name:'Pre-Prothean survivor navy',formation:'defensive_screen',tech:{beamDamage:1.12,kineticBarrierStrength:1.12},
      counts:{past_cycle_dreadnought:10,past_cycle_cruiser:58}},
    b:{faction:'reaper',name:'Reaper cycle harvest group',formation:'capital_column',
      counts:{reaper_capital:12,reaper_destroyer:42}}
  },
];
