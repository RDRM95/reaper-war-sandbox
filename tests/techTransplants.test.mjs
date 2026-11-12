import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// The transplant catalogue has no runtime dependencies on renderer or battle engine.
const dir = mkdtempSync(join(tmpdir(), 'reaper-tech-transplant-'));
const raw = readFileSync(new URL('../src/simulation/techTransplants.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(raw, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
});
writeFileSync(join(dir, 'techTransplants.js'), compiled.outputText);
writeFileSync(join(dir, 'package.json'), '{"type":"commonjs"}');
const require = createRequire(import.meta.url);
const { TECH_TRANSPLANTS, eligibleForTransplant, defenseTransplantFor, transplantedHullDamage } = require(join(dir, 'techTransplants.js'));
const enabled = { enabled:true, id:'adamantium_vibranium', target:'all_organics' };

test('experimental transplants are off unless expressly enabled', () => {
  assert.equal(defenseTransplantFor(undefined, 'alliance', 'A'), undefined);
  assert.equal(defenseTransplantFor({ ...enabled, enabled:false }, 'alliance', 'A'), undefined);
});

test('only eligible organic Mass Effect ships receive the plating', () => {
  for (const faction of ['alliance','turian','asari','salarian','quarian','cerberus']) {
    assert.equal(eligibleForTransplant(faction,'A',enabled), true);
    assert.ok(defenseTransplantFor(enabled,faction,'A'));
  }
  for (const faction of ['reaper','geth','skynet','unsc']) {
    assert.equal(eligibleForTransplant(faction,'A',enabled), false);
    assert.equal(defenseTransplantFor(enabled,faction,'A'), undefined);
  }
});

test('the toggle can select either fleet side independently', () => {
  const oneSide = { ...enabled, target:'side_b_organics' };
  assert.equal(defenseTransplantFor(oneSide,'turian','A'), undefined);
  assert.ok(defenseTransplantFor(oneSide,'turian','B'));
});

test('adamantium-vibranium armour changes actual hull damage, not just UI labels', () => {
  const d = TECH_TRANSPLANTS.adamantium_vibranium.defense;
  assert.ok(transplantedHullDamage(d,'reaper_beam',1000) < 100);
  assert.ok(transplantedHullDamage(d,'kinetic',1000) < 100);
  assert.ok(transplantedHullDamage(d,'laser',1000) > transplantedHullDamage(d,'kinetic',1000));
  assert.equal(transplantedHullDamage(d,'kinetic',0), 0);
  assert.equal(d.blocksInternalWarheads,true);
  assert.ok(d.quickEnduranceMultiplier > 1);
});

test.after(() => rmSync(dir,{recursive:true,force:true}));
