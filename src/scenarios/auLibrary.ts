import type {FactionId} from '@/data/types';
import type {Environment, FormationType} from '@/simulation/types';
import type {TechModifiers} from '@/timelines/rules';

/**
 * Shared AU scenario library for the Spectator and Codex simulators.
 *
 * Dates and fleet compositions are labelled AU fiction, not claimed canon.
 * Canonical physics and weapon simulation are owned by the existing engine.
 * No scripted victors: missions have objectives, and the simulation decides.
 */
export type AUChapterCategory = 'apex'|'humanity'|'cerberus'|'reaper'|'postwar'|'ancient'|'crossover';
export interface AUChapterFleet {
  faction:FactionId; name:string; formation:FormationType;
  counts:Record<string,number>; tech?:Partial<TechModifiers>;
  arrivalTime?:number;
}
export interface AUChapter {
  id:string; name:string; subtitle:string; era:string; category:AUChapterCategory;
  description:string; objective:string; rules:string; environment:Environment;
  distance:number; maxDuration:number; mathRecommended?:boolean;
  a:AUChapterFleet; b:AUChapterFleet; extraA?:AUChapterFleet[]; extraB?:AUChapterFleet[];
}
const classes=(source:string):Record<string,number>=>Object.fromEntries(source.split(',').map(part=>{
  const [id,count]=part.trim().split('=');
  if(!id||!Number.isInteger(Number(count))||Number(count)<1)throw Error('Invalid AU class roster '+part);
  return [id,Number(count)];
}));
const f=(faction:FactionId,name:string,formation:FormationType,ships:string,
  tech?:Partial<TechModifiers>,arrivalTime?:number):AUChapterFleet=>({
    faction,name,formation,counts:classes(ships),tech,arrivalTime
  });

export const AU_CHAPTERS:readonly AUChapter[]=[
  {
    id:'apex_bahak_relays',name:'APEX — Bahak Relay Ambush',subtitle:'The Alpha Relay becomes a Reaper killing ground',
    era:'2185 CE',category:'apex',rules:'prime_apex',environment:'relay',distance:180,maxDuration:460,
    description:'A reconnaissance interception after the Alpha Relay trap; roughly one quarter of the incoming harvest force was destroyed strategically. This tactical fight represents survivors, not the full fleet.',
    objective:'Destroy the Reaper reconnaissance survivors without losing the screening flotilla.',
    a:f('alliance','Alliance Bahak interception screen','strike_wedge','alliance_omaha=1,alliance_cruiser=20,alliance_frigate_thanix=35'),
    b:f('reaper','Disrupted harvest wave','capital_column','reaper_capital=8,reaper_destroyer=29')
  },
  {
    id:'apex_arcturus_bastion',name:'APEX — Fortress Arcturus',subtitle:'Parliament relocated, Arcturus weaponised',
    era:'2186 CE',category:'apex',rules:'prime_apex',environment:'deep_space',distance:130,maxDuration:550,
    description:'Alliance orbital gunships and Black Fleet batteries contest the Reaper opening strike near the Arcturus defensive network. Orbital batteries are abstracted as shipborne heavy guns.',
    objective:'Hold the Arcturus perimeter until the Reaper spearhead loses operational mass.',
    a:f('alliance','Arcturus defensive command','defensive_screen','alliance_omaha=3,alliance_aegis_command=5,alliance_dreadnought=25,alliance_cruiser=65,alliance_frigate=90'),
    extraA:[f('cerberus','Black Fleet reserve','strike_wedge','cerberus_dreadnought=9,cerberus_cruiser=23',undefined,72)],
    b:f('reaper','Arcturus first wave','capital_column','reaper_capital=21,reaper_destroyer=88')
  },
  {
    id:'apex_sol_91',name:'APEX — Sol: The 91-Reaper Breakthrough',subtitle:'Opening day conventional victory, no Crucible',
    era:'2186 CE',category:'apex',rules:'prime_apex',environment:'earth_orbit',distance:155,maxDuration:630,
    description:'Apex lore: 91 Reapers are defeated in Sol and 121 of the 300 allied ships survive. These outcomes are historical targets, not scripted battle math or guaranteed simulator results.',
    objective:'Defeat the initial Reaper strike conventionally and keep Earth sovereign.',
    a:f('alliance','Sol Defence Fleet','line_abreast','alliance_valkyrie=1,alliance_omaha=4,alliance_aegis_command=6,alliance_dreadnought=37,alliance_cruiser=100,alliance_frigate_thanix=150,alliance_carrier=2'),
    b:f('reaper','First-wave Reaper flotilla','capital_column','reaper_capital=22,reaper_destroyer=69')
  },
  {
    id:'apex_cerberus_hades',name:'APEX — Black Fleet: Full Liquidation',subtitle:'Unindoctrinated Cerberus joins Hackett',
    era:'2186 CE',category:'cerberus',rules:'prime_apex',environment:'deep_space',distance:125,maxDuration:520,
    description:'The Illusive Man redirects Cerberus shipyards and HADES munitions against the Reapers. Cerberus uses its actual weapon catalogue; no temporary buffs are invented during combat.',
    objective:'Prevent Reaper escape from the fleet ambush.',
    a:f('cerberus','Black Fleet hunter-killer formation','strike_wedge','cerberus_dreadnought=16,cerberus_cruiser=54,cerberus_frigate=82'),
    extraA:[f('alliance','Alliance screening group','defensive_screen','alliance_aegis_command=3,alliance_cruiser=20,alliance_frigate_thanix=25',undefined,45)],
    b:f('reaper','Isolated Reaper column','capital_column','reaper_capital=15,reaper_destroyer=65')
  },
  {
    id:'apex_palaven_stands',name:'APEX — Palaven Holds',subtitle:'Turian doctrine meets prepared Alliance reserves',
    era:'2186 CE',category:'apex',rules:'prime_apex',environment:'palaven_orbit',distance:145,maxDuration:520,
    description:'The turians refuse to abandon Palaven. Alliance command dreadnoughts reinforce a Hierarchy defensive line.',
    objective:'Hold the Palaven defensive corridor and preserve the Hierarchy battle line.',
    a:f('turian','Palaven integrated fleet','line_abreast','turian_dreadnought=20,turian_cruiser=65,turian_frigate=90'),
    extraA:[f('alliance','Sol reinforcement convoy','defensive_screen','alliance_aegis_command=7,alliance_cruiser=22',undefined,90)],
    b:f('reaper','Palaven spearhead','capital_column','reaper_capital=23,reaper_destroyer=86')
  },
  {
    id:'apex_thessia_stands',name:'APEX — Thessia Refuses the Harvest',subtitle:'A siege fought without abandoning the Republics',
    era:'2187 CE',category:'apex',rules:'prime_apex',environment:'thessia_orbit',distance:145,maxDuration:560,
    description:'Republics dreadnoughts and Alliance support hold a desperate orbital line, even as the wider war remains undecided.',
    objective:'Protect the Thessian orbital lanes and survive the capital assault.',
    a:f('asari','Thessian Republics defence','defensive_screen','destiny_ascension=1,asari_dreadnought=22,asari_cruiser=115'),
    extraA:[f('alliance','Alliance capital reserve','line_abreast','alliance_aegis_command=4,alliance_dreadnought=12',undefined,110)],
    b:f('reaper','Thessian siege flotilla','capital_column','reaper_capital=29,reaper_destroyer=90')
  },
  {
    id:'apex_horizon_guard',name:'APEX — Horizon Guard Last Line',subtitle:'The most disadvantaged battle group of the war',
    era:'2187 CE',category:'apex',rules:'prime_apex',environment:'deep_space',distance:105,maxDuration:470,
    description:'A thinly protected Horizon evacuation corridor is defended by improvised patrol ships and an overstretched command cruiser.',
    objective:'Survive long enough to scatter the Reaper pursuit group.',
    a:f('alliance','Horizon Guard task force','defensive_screen','alliance_aegis_command=1,alliance_cruiser=6,alliance_frigate=27'),
    b:f('reaper','Horizon pursuit group','strike_wedge','reaper_capital=5,reaper_destroyer=25')
  },
  {
    id:'apex_omega_siege',name:'APEX — Omega Batteries',subtitle:'Aria and the Black Fleet defend the Terminus approach',
    era:'2188 CE',category:'apex',rules:'prime_apex',environment:'deep_space',distance:115,maxDuration:490,
    description:'A united Terminus Compact and Cerberus strike fleet uses Omega-inspired heavy battery vessels to blunt the harvest.',
    objective:'Prevent the Reapers from entering the Terminus supply corridor.',
    a:f('terminus_compact','Omega heavy escorts','strike_wedge','compact_siege=17,compact_gunship=98'),
    extraA:[f('cerberus','Black Fleet Omega battery','capital_column','cerberus_dreadnought=11,cerberus_cruiser=25',undefined,55)],
    b:f('reaper','Terminus harvest flotilla','capital_column','reaper_capital=11,reaper_destroyer=52')
  },
  {
    id:'apex_quarian_geth_peace',name:'APEX — Peace Above Rannoch',subtitle:'Quarian and individual geth fleets fight together',
    era:'2186 CE',category:'apex',rules:'prime_apex',environment:'rannoch_orbit',distance:125,maxDuration:500,
    description:'Early quarian–geth reconciliation unites their fleets. The simulation models common external enemies, not sentience or diplomacy.',
    objective:'Protect Rannoch against the Reaper occupation force.',
    a:f('quarian','Migrant Fleet battle group','defensive_screen','quarian_liveship=2,quarian_heavy=12,quarian_cruiser=50'),
    extraA:[f('geth','Geth allied naval consensus','line_abreast','geth_dreadnought=3,geth_cruiser=34,geth_frigate=52',undefined,20)],
    b:f('reaper','Rannoch Reaper occupation','capital_column','reaper_capital=8,reaper_destroyer=42')
  },
  {
    id:'apex_earth_2195',name:'APEX — Nine Years of War: Earth',subtitle:'Harbinger dies by conventional naval power',
    era:'2195 CE',category:'apex',rules:'prime_apex',environment:'earth_orbit',distance:180,maxDuration:650,mathRecommended:true,
    description:'The nine-year attritional war ends without using the Crucible. The flagship and Ascendant are different AUs: Harbinger is the final target here. Designed for quick numerical resolution at large fleet sizes.',
    objective:'Destroy Harbinger and the last conventional Reaper fleet.',
    a:f('alliance','Alliance and combined citadel armada','line_abreast','alliance_valkyrie=1,alliance_omaha=12,alliance_aegis_command=42,alliance_dreadnought=160,alliance_cruiser=450,alliance_frigate_thanix=880,alliance_carrier=30'),
    extraA:[f('cerberus','Black Fleet closing assault','strike_wedge','cerberus_dreadnought=38,cerberus_cruiser=90',undefined,70)],
    b:f('reaper','Harbinger final command','capital_column','harbinger=1,reaper_capital=70,reaper_destroyer=265')
  },
  {
    id:'axiom_sword_fleet',name:'Axiom — Sword Fleet Duel',subtitle:'A remorseful Reaper meets Harbinger',
    era:'2195 CE · Axiom AU',category:'apex',rules:'prime_apex',environment:'earth_orbit',distance:95,maxDuration:440,
    description:'Axiom challenges Harbinger and a guard of twenty capital Reapers. Its protective escorts are original AU designs.',
    objective:'Break Harbinger’s shield formation before Axiom is destroyed.',
    a:f('axiom_guard','Axiom Sword Fleet','strike_wedge','axiom_ancient=1,axiom_warden=20'),
    b:f('reaper','Harbinger and twenty guardians','capital_column','harbinger=1,reaper_capital=20')
  },
  {
    id:'humanity_first_contact_2157',name:'Iron Sol — First Contact War',subtitle:'Prepared humans intercept the Hierarchy',
    era:'2157 CE',category:'humanity',rules:'iron_dawn',environment:'relay',distance:135,maxDuration:510,
    description:'Humanity’s fortified solar system meets an unprepared turian expedition. This original AU is distinct from the canonical First Contact War.',
    objective:'Secure the relay approach and prevent hostile incursions into Sol.',
    a:f('alliance','Iron Sol defence squadrons','line_abreast','alliance_aegis_command=3,alliance_dreadnought=24,alliance_cruiser=95,alliance_frigate=120'),
    b:f('turian','Hierarchy expeditionary fleet','strike_wedge','turian_dreadnought=7,turian_cruiser=50,turian_frigate=90')
  },
  {
    id:'humanity_isolationist_2183',name:'Isolationist Alliance — Sol Exclusion Zone',subtitle:'The Alliance never signs the Farixen treaty',
    era:'2183 CE',category:'humanity',rules:'relay_free_humanity',environment:'earth_orbit',distance:165,maxDuration:510,
    description:'A defensive, exceptionally large Alliance battlespace holds external navies at the edge of Sol. This is a hypothetical engagement, not a claim the Council invaded Earth.',
    objective:'Prevent foreign reconnaissance from penetrating the inner solar defence.',
    a:f('alliance','Isolated Sol fortress fleet','defensive_screen','alliance_omaha=7,alliance_aegis_command=15,alliance_dreadnought=55,alliance_cruiser=125'),
    b:f('turian','Council security task group','strike_wedge','turian_dreadnought=13,turian_cruiser=65,turian_frigate=100')
  },
  {
    id:'humanity_ascendant_sov_2183',name:'Humanity Ascendant — Sovereign’s Last Minute',subtitle:'The Battle of the Citadel ends early',
    era:'2183 CE',category:'humanity',rules:'humanity_ascendant',environment:'citadel',distance:130,maxDuration:440,
    description:'A much stronger Alliance mobilises at the Citadel. Sovereign’s surprised QEC goes silent after concentrated mass accelerator volleys.',
    objective:'Save the Citadel Council and destroy Sovereign’s flagship.',
    a:f('alliance','Alliance Citadel intervention','line_abreast','alliance_dreadnought=50,alliance_cruiser=185,alliance_frigate_thanix=260'),
    b:f('reaper','Sovereign spearhead','strike_wedge','reaper_capital=1,reaper_destroyer=25')
  },
  {
    id:'humanity_no_farixen',name:'Treaty Refused — The Dreadnought Demonstration',subtitle:'The Alliance refuses numerical capital-ship limits',
    era:'2183 CE',category:'humanity',rules:'humanity_ascendant',environment:'relay',distance:155,maxDuration:480,
    description:'A hypothetical Council standoff around a relay. Both governments retain national doctrine: nothing about the original trilogy mandates this war.',
    objective:'Hold the relay corridor against an opposing capital formation.',
    a:f('alliance','Independent Alliance Grand Fleet','line_abreast','alliance_aegis_command=14,alliance_dreadnought=90,alliance_cruiser=135'),
    b:f('turian','Council deterrent armada','capital_column','turian_dreadnought=28,turian_cruiser=115')
  },
  {
    id:'humanity_early_beacon',name:'The Early Beacon — Five Centuries of Preparation',subtitle:'Humanity acquires Prothean insight far earlier',
    era:'2186 CE · Early beacon AU',category:'humanity',rules:'beacon_1800',environment:'deep_space',distance:175,maxDuration:520,
    description:'A highly advanced human force demonstrates technological maturity after centuries of isolated preparation.',
    objective:'Defeat a Reaper reconnaissance fleet without committing the home defence.',
    a:f('alliance','Early Beacon capital group','line_abreast','alliance_omaha=8,alliance_aegis_command=28,alliance_dreadnought=55,alliance_cruiser=100'),
    b:f('reaper','Opening survey strike','capital_column','reaper_capital=21,reaper_destroyer=84')
  },
  {
    id:'humanity_eezo_foundry',name:'Eezo Foundry — Strategic Interception',subtitle:'Element zero generation becomes possible',
    era:'2200 CE · Eezo fabrication AU',category:'humanity',rules:'hfy_terran_ascendancy',environment:'deep_space',distance:165,maxDuration:480,
    description:'A speculative solar foundry generates element zero industrially, enabling massive ship production. Eezo engineering is represented as fleet composition, not a new physical resource simulation.',
    objective:'Repel an attempted Reaper technology seizure near the foundry.',
    a:f('alliance','Foundry security armada','defensive_screen','alliance_aegis_command=36,alliance_omaha=14,alliance_dreadnought=80,alliance_cruiser=160'),
    b:f('reaper','Harvester acquisition unit','capital_column','reaper_capital=20,reaper_destroyer=80')
  },
  {
    id:'cerberus_alliance_union',name:'Cerberus–Alliance Union',subtitle:'Destroy-aligned Black Fleet co-commands the war',
    era:'2186 CE · Union AU',category:'cerberus',rules:'aligned_humanity',environment:'deep_space',distance:140,maxDuration:520,
    description:'The Illusive Man fully shares Cerberus assets, purges indoctrination, and cooperates with Anderson and Hackett against the Reapers.',
    objective:'Execute the joint naval ambush with minimal Alliance casualties.',
    a:f('alliance','Alliance Union battle group','line_abreast','alliance_aegis_command=12,alliance_dreadnought=35,alliance_cruiser=75'),
    extraA:[f('cerberus','Union Black Fleet','strike_wedge','cerberus_dreadnought=25,cerberus_cruiser=65',undefined,38)],
    b:f('reaper','Reaper Union target','capital_column','reaper_capital=32,reaper_destroyer=120')
  },
  {
    id:'cerberus_ascendant_destroy',name:'Cerberus Ascendant — The Other Destroy',subtitle:'Humanity dominates the final anti-Reaper coalition',
    era:'2186 CE · Cerberus-aligned AU',category:'cerberus',rules:'cerberus_ascendant',environment:'earth_orbit',distance:155,maxDuration:590,
    description:'A distinct darker Union timeline: Cerberus overtakes conventional Council fleets but still seeks destruction of Reapers rather than Control.',
    objective:'Destroy the Reaper group by conventional force.',
    a:f('cerberus','Cerberus destroyer Black Fleet','capital_column','cerberus_dreadnought=50,cerberus_cruiser=110,cerberus_frigate=170'),
    extraA:[f('alliance','Alliance reinforcements','defensive_screen','alliance_dreadnought=20,alliance_cruiser=55',undefined,65)],
    b:f('reaper','Reaper counteroffensive','capital_column','reaper_capital=42,reaper_destroyer=120')
  },
  {
    id:'sovereign_triumph',name:'Sovereign Triumph — The Citadel Falls',subtitle:'The Reaper vanguard successfully opens the way',
    era:'2183 CE · Reaper victory AU',category:'reaper',rules:'reaper_escalation',environment:'citadel',distance:130,maxDuration:540,
    description:'Sovereign wins the Citadel battle and the galaxy confronts the harvest years early. This is the opening counterstroke, not the full war.',
    objective:'Break the remaining Citadel defence before reinforcements arrive.',
    a:f('reaper','Sovereign vanguard','strike_wedge','reaper_capital=1,reaper_destroyer=32'),
    extraA:[f('reaper','Harvest relay reinforcements','capital_column','reaper_capital=15,reaper_destroyer=70',undefined,130)],
    b:f('alliance','Citadel rescue flotilla','defensive_screen','alliance_dreadnought=8,alliance_cruiser=35,alliance_frigate=65')
  },
  {
    id:'reaper_won_milky_way',name:'The Harvest Completed — Galaxy Subdued',subtitle:'The Reaper cycle wins its 2186 war',
    era:'2200 CE · Reaper victory AU',category:'reaper',rules:'reaper_escalation',environment:'deep_space',distance:115,maxDuration:480,
    description:'The Reapers win and attack scattered survivor fleets. This battle represents a single interception, not the extermination of an entire galaxy.',
    objective:'Intercept the last organised fleet before it escapes.',
    a:f('reaper','Reaper cycle police group','capital_column','reaper_capital=14,reaper_destroyer=70'),
    b:f('alliance','Last Alliance evacuation screen','defensive_screen','alliance_dreadnought=5,alliance_cruiser=25,alliance_frigate=55')
  },
  {
    id:'tim_control_after_shepard',name:'Control AU — The Illusive Man’s Fleet',subtitle:'Shepard never returns; Cerberus claims the Reapers',
    era:'2206 CE · Control AU',category:'cerberus',rules:'cerberus_ascendant',environment:'deep_space',distance:130,maxDuration:530,
    description:'A counterfactual 20-year rebuild after Shepard dies during the Collector campaign. TIM’s controlled Reaper fleet confronts post-war dissidents; command allegiance is encoded by side, not indoctrination gameplay.',
    objective:'Defend the controlled Reaper flotilla against rebel Alliance attackers.',
    a:f('reaper','TIM-controlled Reaper Fleet','capital_column','reaper_capital=20,reaper_destroyer=77'),
    extraA:[f('cerberus','Cerberus loyalist escort','defensive_screen','cerberus_dreadnought=22,cerberus_cruiser=55',undefined,20)],
    b:f('alliance','Dissident Alliance navy','strike_wedge','alliance_dreadnought=35,alliance_cruiser=65,alliance_frigate_thanix=75')
  },
  {
    id:'prothean_early_resistance',name:'Protheans — The Cycle That Could Have Held',subtitle:'A previous galaxy attempts a unified defence',
    era:'50,000 years before the trilogy · Prothean AU',category:'ancient',rules:'prothean_victory',environment:'deep_space',distance:155,maxDuration:510,
    description:'A counterfactual Prothean coalition commits its fleets at the first Reaper appearance. Authentic Prothean fleet specifications are not known.',
    objective:'Defeat the invading Reaper vanguard before Prothean logistics collapse.',
    a:f('prothean','Prothean imperial reserve','line_abreast','prothean_dreadnought=20,prothean_cruiser=100'),
    b:f('reaper','Initial Reaper harvest wave','capital_column','reaper_capital=30,reaper_destroyer=115')
  },
  {
    id:'previous_cycle_exodus',name:'The Exiles — Escape from the Last Cycle',subtitle:'Earlier harvest refugees flee past the galactic rim',
    era:'Millions of years before 2186 · Exiles AU',category:'ancient',rules:'past_cycles',environment:'deep_space',distance:105,maxDuration:480,
    description:'A refugee fleet survives a previous harvest and departs the galaxy before the Reapers can finish their cycle.',
    objective:'Open an escape corridor by defeating the Reaper escort.',
    a:f('exile_hegemony','First exile arks','defensive_screen','exile_ark=5,exile_raider=34'),
    b:f('reaper','Pursuit Reaper detail','strike_wedge','reaper_capital=8,reaper_destroyer=34')
  },
  {
    id:'exiles_ancestral_claim',name:'The Exiles — Ancestral Claim',subtitle:'Previous-cycle descendants threaten the Citadel',
    era:'3000 CE · Exile Hegemony AU',category:'postwar',rules:'prime_apex',environment:'relay',distance:135,maxDuration:530,
    description:'After the Reaper War, the descendants of ancient evacuees demand territorial restoration by force.',
    objective:'Protect Citadel relay traffic from the Exile Hegemony.',
    a:f('alliance','Citadel defence compact','line_abreast','alliance_aegis_command=9,alliance_dreadnought=25,alliance_cruiser=70'),
    b:f('exile_hegemony','Hegemony reclamation arks','strike_wedge','exile_ark=16,exile_raider=105')
  },
  {
    id:'ascendant_contact_2885',name:'2885 — First Ascendant Contact',subtitle:'The Milky Way learns of extragalactic Reapers',
    era:'2885 CE · Post-Destroy AU',category:'postwar',rules:'prime_apex',environment:'deep_space',distance:220,maxDuration:580,
    description:'699 years after the Destroy ending, a 30-km Ascendant-class Reaper arrives. This AU is separate from Apex’s conventional-successful-Refuse timeline.',
    objective:'Survive the first Ascendant long enough to call reinforcements.',
    a:f('alliance','Post-Destroy Milky Way picket','defensive_screen','alliance_aegis_command=14,alliance_omaha=5,alliance_dreadnought=60,alliance_cruiser=120'),
    b:f('reaper','Extragalactic Ascendant reconnaissance','capital_column','reaper_ascendant=1,reaper_capital=7,reaper_destroyer=20')
  },
  {
    id:'ascendant_rebuffed_2890',name:'Ascendants Repelled — Extragalactic Response',subtitle:'A second Reaper echelon arrives',
    era:'2890 CE · Post-Destroy AU',category:'postwar',rules:'prime_apex',environment:'deep_space',distance:235,maxDuration:590,mathRecommended:true,
    description:'Following the destruction of the initial Ascendants, a higher intergalactic Reaper force arrives. Numbers and capability tiers are fictional.',
    objective:'Repel the new intergalactic response force without allowing it through the relay corridor.',
    a:f('alliance','Post-Destroy reconstruction armada','line_abreast','alliance_aegis_command=45,alliance_omaha=20,alliance_dreadnought=200,alliance_cruiser=460'),
    extraA:[f('geth','Geth deep-range reserve','defensive_screen','geth_dreadnought=32,geth_cruiser=110',undefined,100)],
    b:f('reaper','Ascendant intervention formation','capital_column','reaper_ascendant=8,reaper_capital=35,reaper_destroyer=90')
  },
  {
    id:'reaper_extragalactic_harvest',name:'The Harvest Beyond the Milky Way',subtitle:'The cycle expands across neighbouring galaxies',
    era:'Far future · Reaper universal-harvest AU',category:'reaper',rules:'reaper_escalation',environment:'deep_space',distance:210,maxDuration:540,
    description:'The Reapers subject other galaxies to periodic cycles. The displayed flotilla is a local force only; entire galaxies, multiverses or cosmological epochs are narrative scope, not simulated entities.',
    objective:'Prevent an extragalactic civilisation from evacuating its relic fleet.',
    a:f('reaper','Extragalactic harvest command','capital_column','reaper_ascendant=3,reaper_capital=16,reaper_destroyer=74'),
    b:f('past_cycle','Independent-galaxy survivor navy','defensive_screen','past_cycle_dreadnought=30,past_cycle_cruiser=95')
  },
  {
    id:'reaper_universal_response',name:'The Universal Reapers Arrive',subtitle:'A higher strategic tier answers the Ascendants’ loss',
    era:'2895 CE · Universal response AU',category:'postwar',rules:'reaper_escalation',environment:'deep_space',distance:260,maxDuration:650,mathRecommended:true,
    description:'Universal-scale Reaper command is a narrative tier. A small representative intervention group uses the Ascendant as its playable stand-in; no invented universe-size starship is presented as an asset.',
    objective:'Deny the intervention force a lodgement in the Milky Way.',
    a:f('alliance','Combined Milky Way defence reserve','line_abreast','alliance_aegis_command=120,alliance_omaha=40,alliance_dreadnought=350,alliance_cruiser=600'),
    b:f('reaper','Universal command intervention','capital_column','reaper_ascendant=15,reaper_capital=60,reaper_destroyer=240')
  },
  {
    id:'terminus_aria_union',name:'Terminus Compact — Aria’s War Economy',subtitle:'Batarian survivors and frontier dockyards unite',
    era:'2187 CE · Apex Terminus AU',category:'apex',rules:'prime_apex',environment:'relay',distance:135,maxDuration:530,
    description:'The remnants of the Hegemony, independent systems and Aria-aligned private fleets develop an improvised conventional Reaper defence.',
    objective:'Hold the Terminus transit route.',
    a:f('terminus_compact','Terminus coalition siege squadrons','defensive_screen','compact_siege=38,compact_gunship=210'),
    b:f('reaper','Terminus Reaper breach formation','capital_column','reaper_capital=22,reaper_destroyer=90')
  },
  {
    id:'skynet_reaper_deadspace',name:'Skynet Meets the Reapers',subtitle:'Autonomous killcraft fight the harvest',
    era:'Crossover AU · No shared canon',category:'crossover',rules:'multiverse_crossover',environment:'deep_space',distance:150,maxDuration:500,
    description:'An explicit fictional crossover with an invented orbital Skynet fleet. Destroyer-class Reapers retain their own anatomy and capabilities.',
    objective:'Compare the two machine-war doctrines in a closed engagement.',
    a:f('skynet','Machine extermination flotilla','strike_wedge','skynet_harvester=16,skynet_hunter=125'),
    b:f('reaper','Harvester Reaper task group','capital_column','reaper_capital=12,reaper_destroyer=50')
  }
];
