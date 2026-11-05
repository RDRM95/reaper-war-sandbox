import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,statSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));
const base=join(dir,'../public/assets/ships');
const manifest=JSON.parse(readFileSync(join(base,'models.json'),'utf8'));
const ids=['kilimanjaro','everest','alliance-cruiser','alliance-frigate','normandy','valkyrie','black-dread','black-cruiser','black-frigate','sovereign','harbinger','reaper-destroyer','oculus'];
test('ship manifest covers all 13 ship classes',()=>{
  assert.deepEqual(Object.keys(manifest).sort(),ids.sort());
});
test('referenced GLB model files have correct GLB headers and nonempty data',()=>{
  for(const id of ids){
    const file=manifest[id];
    assert.ok(/^[a-z0-9-]+\.glb$/.test(file),`Bad model path for ${id}`);
    const path=join(base,file);const blob=readFileSync(path);
    assert.ok(statSync(path).size>1000,`Empty model for ${id}`);
    assert.equal(blob.toString('utf8',0,4),'glTF',`GLB magic for ${id}`);
    assert.equal(blob.readUInt32LE(4),2,`GLB version for ${id}`);
    assert.equal(blob.readUInt32LE(8),blob.length,`GLB byte length for ${id}`);
  }
});
