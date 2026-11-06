import { test, expect } from '@playwright/test';

test('AU catalogue has valid factions, models, real hardpoints and bounded combat stats', async ({page})=>{
  await page.goto('/?reference=sol-42&t=0');
  const quality=await page.evaluate(async ()=>{
    const { SHIP_CLASSES }=await import('/src/data/ships.ts');
    const { WEAPONS }=await import('/src/data/weapons.ts');
    const { FACTIONS }=await import('/src/data/factions.ts');
    const { hasModel }=await import('/src/rendering/ships/index.ts');
    const { EXPANDED_BATTLES }=await import('/src/scenarios/expandedBattles.ts');
    const errors:string[]=[];
    const seen=new Set<string>();
    for(const [key,cls] of Object.entries(SHIP_CLASSES)){
      if(key!==cls.id)errors.push('Class ID mismatch: '+key);
      if(!FACTIONS[cls.faction])errors.push('Missing faction: '+key);
      if(!hasModel(key))errors.push('Missing 3D model: '+key);
      for(const name of ['lengthM','hull','armour','barriers','maxSpeed','acceleration','turnRate'] as const) {
        const value=cls[name].value;
        if(!Number.isFinite(value)||value<0)errors.push('Bad '+name+': '+key);
      }
      if(cls.hardpoints.length===0)errors.push('Unarmed class: '+key);
      for(const hp of cls.hardpoints){
        if(!WEAPONS[hp.weaponId])errors.push('Unknown weapon: '+key+' / '+hp.weaponId);
        if(hp.count<1||hp.count>40)errors.push('Excessive mount count: '+key);
      }
      if(cls.pointValue<=0)errors.push('Invalid points: '+key);
    }
    for(const [key,w] of Object.entries(WEAPONS)){
      if(key!==w.id)errors.push('Weapon ID mismatch: '+key);
      if(!(w.damage>0&&w.cooldown>0&&w.range>0))errors.push('Invalid weapon: '+key);
    }
    for(const chapter of EXPANDED_BATTLES){
      if(seen.has(chapter.id))errors.push('Duplicate chapter: '+chapter.id);
      seen.add(chapter.id);
      for(const side of [chapter.a,chapter.b]) {
        if(!FACTIONS[side.faction])errors.push('Missing chapter faction: '+chapter.id);
        for(const [id,count] of Object.entries(side.counts)){
          if(!SHIP_CLASSES[id])errors.push('Unknown chapter ship: '+chapter.id+' / '+id);
          else if(SHIP_CLASSES[id].faction!==side.faction)errors.push('Wrong chapter faction: '+chapter.id+' / '+id);
          if(count<=0||count>1000000)errors.push('Invalid chapter count: '+chapter.id+' / '+id);
        }
      }
    }
    return {errors,ships:Object.keys(SHIP_CLASSES).length,weapons:Object.keys(WEAPONS).length,chapters:EXPANDED_BATTLES.length};
  });
  expect(quality.errors).toEqual([]);
  expect(quality.chapters).toBeGreaterThanOrEqual(6);
  console.log('AU_CATALOG_QC',quality);
});

test('million-vessel quick report is deterministic and does not run a battle tick',async({page})=>{
  await page.goto('/?reference=sol-42&t=0');
  const result=await page.evaluate(async()=>{
    const { buildScenario }=await import('/src/scenarios/index.ts');
    const { resolveQuickBattle }=await import('/src/simulation/quickBattle.ts');
    const config=buildScenario('axiom_reckoning','prime_apex',42);
    config.fleets[0].ships[0].count=1000000;
    config.fleets[1].ships[0].count=1100000;
    const started=performance.now();
    const first=resolveQuickBattle(config);
    const elapsed=performance.now()-started;
    const second=resolveQuickBattle(config);
    const classes=Object.values(first.battle.sides.A.lossesByClass);
    return {
      elapsed,identical:JSON.stringify(first)===JSON.stringify(second),
      count:first.shipsAnalysed,remainingValid:
      (first.battle.sides.A.survivors+first.battle.sides.A.destroyed===first.battle.sides.A.deployed)&&
      (first.battle.sides.B.survivors+first.battle.sides.B.destroyed===first.battle.sides.B.deployed),
      validClassLosses:classes.every(c=>c.lost>=0&&c.lost<=c.deployed),
      approximate:first.approximate,method:first.method
    };
  });
  expect(result.identical).toBe(true);
  expect(result.remainingValid).toBe(true);
  expect(result.validClassLosses).toBe(true);
  expect(result.approximate).toBe(true);
  expect(result.method).toBe('aggregate-estimate-v1');
  expect(result.count).toBeGreaterThan(2100000);
  expect(result.elapsed).toBeLessThan(2000);
});

test('Reaper limbs and aperture animate independently without moving hull root',async({page})=>{
  await page.goto('/?reference=sol-42&t=0');
  const result=await page.evaluate(async()=>{
    const { buildReaperCapital,buildReaperDestroyer }=await import('/src/rendering/ships/reaper.ts');
    const { captureReaperRig,animateReaperRig }=await import('/src/rendering/reaperMotion.ts');
    const sample=(destroyer:boolean)=>{
      const built=destroyer?buildReaperDestroyer():buildReaperCapital();
      const rig=captureReaperRig(built.group,destroyer?'destroyer-1':'capital-1');
      const ship={
        id:destroyer?'destroyer-1':'capital-1',faction:'reaper',
        role:destroyer?'reaper_destroyer':'reaper_capital',maxSpeed:1,
        vel:{x:.4,y:0,z:0},targetId:'contact',weapons:[{
          cooldown:.3,beamRemaining:0,def:{kind:'reaper_beam',damage:1900,antiSmall:false,arc:60}
        }]
      } as unknown as Parameters<typeof animateReaperRig>[1];
      const worldBefore=built.group.position.toArray();
      animateReaperRig(rig,ship,0,1/60);
      const a=rig.shoulders[0]?.rotation.x??0;
      animateReaperRig(rig,ship,7.5,1/60);
      const b=rig.shoulders[0]?.rotation.x??0;
      return {shoulders:rig.shoulders.length,elbows:rig.elbows.length,
        mandibles:rig.mandibles.length,shutters:rig.shutters.length,
        independentMotion:Math.abs(a-b)>0.0001,
        fixedHull:JSON.stringify(worldBefore)===JSON.stringify(built.group.position.toArray()),
        opened:rig.shutters.some(g=>Number(g.userData.open)>0.11)
      };
    };
    return {capital:sample(false),destroyer:sample(true)};
  });
  for(const [kind,caseResult] of Object.entries(result)){
    expect(caseResult.shoulders).toBe(kind==='capital'?6:4);
    expect(caseResult.elbows).toBe(caseResult.shoulders);
    expect(caseResult.mandibles).toBe(5);
    expect(caseResult.shutters).toBe(4);
    expect(caseResult.independentMotion).toBe(true);
    expect(caseResult.fixedHull).toBe(true);
    expect(caseResult.opened).toBe(true);
  }
});

test('instant UI uses current AU rosters while leaving live simulation untouched',async({page})=>{
  await page.goto('/?reference=sol-42&t=0');
  await page.locator('#scenario').selectOption('axiom_reckoning');
  const before=await page.evaluate(()=>window.__reaperDiagnostics?.()?.time);
  await page.locator('#resolve').click();
  await expect(page.locator('#quick-report')).toBeVisible();
  await expect(page.locator('#quick-results h2')).not.toBeEmpty();
  await expect(page.locator('#quick-report')).toContainText('AGGREGATE BATTLE MATHEMATICS');
  const after=await page.evaluate(()=>window.__reaperDiagnostics?.()?.time);
  expect(after).toBe(before);
  await page.locator('#quick-close').click();
  await expect(page.locator('#quick-report')).toBeHidden();
});

test('fullscreen and first-person gunnery keep the same battle alive',async({page})=>{
  await page.goto('/?reference=sol-42&t=0');
  await page.locator('#gunner').click();
  await expect(page.locator('#stage')).toHaveClass(/gunnery-active/);
  await expect(page.locator('.gunnery-line')).toBeVisible();
  const before=await page.evaluate(()=>window.__reaperDiagnostics?.()?.shipCount);
  await page.locator('#fullscreen').click();
  await expect.poll(async()=>page.evaluate(()=>document.fullscreenElement?.id??null)).toBe('stage');
  await page.keyboard.press('Escape');
  await expect.poll(async()=>page.evaluate(()=>document.fullscreenElement)).toBeNull();
  const after=await page.evaluate(()=>window.__reaperDiagnostics?.()?.shipCount);
  expect(after).toBe(before);
});
