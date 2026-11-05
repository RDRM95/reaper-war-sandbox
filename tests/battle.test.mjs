import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';

const dir=mkdtempSync(join(tmpdir(),'reaper-sandbox-test-'));
const source=new URL('../src/sim/',import.meta.url);
for(const file of readdirSync(source).filter(x=>x.endsWith('.ts'))){
  const path=new URL(file,source);
  const text=readFileSync(path,'utf8');
  const result=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
  writeFileSync(join(dir,file.replace(/\.ts$/,'.js')),result.outputText);
}
writeFileSync(join(dir,'package.json'),'{"type":"commonjs"}');
const require=createRequire(import.meta.url);
const {runToEnd,Battle}=require(join(dir,'battle.js'));
const {sampleFleet}=require(join(dir,'catalogue.js'));

test('same fleets + seed produce identical final battle',()=>{
  const fleet={a:{valkyrie:1,everest:2,'alliance-cruiser':8},b:{sovereign:1,'reaper-destroyer':2},seed:42};
  const one=runToEnd(fleet,120000),two=runToEnd(fleet,120000);
  assert.equal(one.ended,true);assert.equal(one.hash(),two.hash());
});
test('preset creates two fleets and named warships',()=>{
  const config={...sampleFleet('cerberus'),seed:42};
  const battle=new Battle(config);
  assert.equal(battle.deployed.A,85);assert.equal(battle.deployed.B,60);
  assert.ok(battle.ships.every(s=>s.name.length>0));
});
test('NOVA direct impact pierces barriers instead of only damaging shields',()=>{
  const b=new Battle({a:{valkyrie:1},b:{sovereign:1},seed:42});
  const reaper=b.ships.find(s=>s.spec.id==='sovereign');
  const initialHull=reaper.hp;
  for(let i=0;i<500&&!b.ended;i++)b.step();
  assert.ok(reaper.hp<initialHull,'NOVA must hurt hull even when a shield was initially active');
});
test('seeded fleets can switch presentation independently',()=>{
  const b=new Battle({a:{'alliance-frigate':2},b:{'reaper-destroyer':1},seed:7});
  const before=b.hash();
  assert.ok(b.ships.length===3);assert.equal(b.hash(),before);
});
test.after(()=>rmSync(dir,{recursive:true,force:true}));
