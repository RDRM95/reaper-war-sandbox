import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Exercise the production rules/catalogue, without a browser or duplicated modifiers.
const dir = mkdtempSync(join(tmpdir(), 'apex-oculus-rules-'));
writeFileSync(join(dir, 'package.json'), '{"type":"commonjs"}');
for (const path of ['core/provenance', 'data/types', 'data/auFactions', 'data/crossover',
  'data/weapons', 'timelines/rules', 'timelines/presets', 'simulation/reaperHardcore']) {
  const source = readFileSync(new URL('../src/' + path + '.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText.replaceAll('@/core/provenance', './provenance').replaceAll('@/data/types', './types');
  writeFileSync(join(dir, basename(path) + '.js'), js);
}
const require = createRequire(import.meta.url);
const { WEAPONS } = require(join(dir, 'weapons.js'));
const { getPreset } = require(join(dir, 'presets.js'));
const { applyRulesToWeapon } = require(join(dir, 'rules.js'));
const { hardcoreReaperBeamDamage } = require(join(dir, 'reaperHardcore.js'));
const fighter = { role: 'fighter', faction: 'reaper' };
const capital = { role: 'reaper_capital', faction: 'reaper' };

test('Annihilation boosts the ship-scale Reaper gun but not an Oculus pulse', () => {
  for (const id of ['canon_me3', 'prime_apex', 'reaper_hardcore']) {
    const pulse = applyRulesToWeapon(WEAPONS.oculus_beam, 'reaper', fighter, getPreset(id), WEAPONS);
    assert.equal(pulse.damage, 26);
    assert.equal(pulse.beamDuration, .85);
  }
  const main = applyRulesToWeapon(WEAPONS.reaper_capital_beam, 'reaper', capital, getPreset('reaper_hardcore'), WEAPONS);
  assert.equal(main.damage, 2660);
});

test('fighter strength and ship/Thanix beam upgrades retain separate effects', () => {
  const rules = getPreset('reaper_hardcore');
  rules.reaper.fighterStrength = 2; rules.reaper.beamDamage = 3;
  assert.equal(applyRulesToWeapon(WEAPONS.oculus_beam, 'reaper', fighter, rules, WEAPONS).damage, 52);
  assert.equal(applyRulesToWeapon(WEAPONS.reaper_capital_beam, 'reaper', capital, rules, WEAPONS).damage, 5700);
  const apex = getPreset('prime_apex');
  assert.equal(applyRulesToWeapon(WEAPONS.alliance_thanix, 'alliance', { role: 'frigate' }, apex, WEAPONS).damage,
    WEAPONS.alliance_thanix.damage * apex.organic.beamDamage);
});

test('the capital one-shot override never applies to an Oculus or a fighter hull', () => {
  const rules = getPreset('reaper_hardcore');
  const target = { classId: 'alliance_dreadnought', faction: 'alliance', maxHull: 1000, maxBarriers: 1000, armour: 40 };
  assert.equal(hardcoreReaperBeamDamage(rules, fighter, target, WEAPONS.oculus_beam, 1), 1);
  assert.equal(hardcoreReaperBeamDamage(rules, capital, target, WEAPONS.oculus_beam, 1), 1);
  assert.equal(hardcoreReaperBeamDamage(rules, fighter, target, WEAPONS.reaper_capital_beam, 1), 1);
  assert.ok(hardcoreReaperBeamDamage(rules, capital, target, WEAPONS.reaper_capital_beam, 1) > 2000);
});

test.after(() => rmSync(dir, { recursive: true, force: true }));
