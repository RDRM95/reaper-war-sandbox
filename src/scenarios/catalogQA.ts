import { SHIP_CLASSES } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';
import { FACTIONS } from '@/data/factions';
import { getPreset } from '@/timelines/presets';
import { AU_CHAPTERS } from './auLibrary';

/** Safe catalogue preflight; builds no BattleSimulation, ships or GPU objects. */
export interface AUCatalogueIssue {
  chapterId: string;
  code: 'duplicate_id'|'invalid_rules'|'invalid_faction'|'invalid_class'|
    'faction_mismatch'|'invalid_count'|'invalid_weapon'|'invalid_arrival'|'no_ships'|
    'invalid_metadata';
  message: string;
}
export interface AUCatalogueSummary {
  chapters: number;
  largestHullCount: number;
  strategicMathRecommended: number;
  issues: AUCatalogueIssue[];
}
export function auditAULibrary():AUCatalogueSummary {
  const issues:AUCatalogueIssue[]=[];
  const seen=new Set<string>();
  let largest=0,math=0;
  for(const chapter of AU_CHAPTERS){
    const fail=(code:AUCatalogueIssue['code'],message:string)=>
      issues.push({chapterId:chapter.id,code,message});
    if(seen.has(chapter.id))fail('duplicate_id','Duplicate scenario ID');
    seen.add(chapter.id);
    try{getPreset(chapter.rules);}catch{fail('invalid_rules','Timeline '+chapter.rules+' does not exist');}
    if(!chapter.id||!chapter.name||!chapter.description||!chapter.objective||
      !Number.isFinite(chapter.distance)||chapter.distance<10||
      !Number.isFinite(chapter.maxDuration)||chapter.maxDuration<=0)
      fail('invalid_metadata','Missing scenario brief or invalid time/range');
    const fleets=[chapter.a,...(chapter.extraA??[]),chapter.b,...(chapter.extraB??[])];
    let hulls=0;
    for(const fleet of fleets){
      if(!FACTIONS[fleet.faction])fail('invalid_faction',String(fleet.faction));
      if(fleet.arrivalTime!==undefined&&
        (!Number.isFinite(fleet.arrivalTime)||fleet.arrivalTime<0))
        fail('invalid_arrival',fleet.name);
      if(!Object.keys(fleet.counts).length)fail('no_ships',fleet.name);
      for(const [id,count] of Object.entries(fleet.counts)){
        const cls=SHIP_CLASSES[id];
        if(!cls){fail('invalid_class',id);continue;}
        if(cls.faction!==fleet.faction)fail('faction_mismatch',id+' belongs to '+cls.faction+' not '+fleet.faction);
        if(!Number.isSafeInteger(count)||count<1||count>1000000)fail('invalid_count',id+': '+count);
        hulls+=count;
        for(const mount of cls.hardpoints){
          if(!WEAPONS[mount.weaponId])fail('invalid_weapon',id+': '+mount.weaponId);
        }
      }
    }
    largest=Math.max(largest,hulls);
    if(chapter.mathRecommended)math++;
    // A 12k-plus deployment should prefer numerical resolution; flagging
    // rather than deleting these user-authored strategic scenarios.
    if(hulls>12000&&!chapter.mathRecommended)
      fail('invalid_metadata','Mark >12k ships as mathRecommended');
  }
  return{chapters:AU_CHAPTERS.length,largestHullCount:largest,
    strategicMathRecommended:math,issues};
}
