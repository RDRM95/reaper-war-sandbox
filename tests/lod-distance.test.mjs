import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Test the production LOD policy without a browser or graphics card.
const directory = mkdtempSync(join(tmpdir(), 'reaper-lod-'));
const source = readFileSync(new URL('../src/rendering/lod.ts', import.meta.url), 'utf8');
writeFileSync(join(directory, 'lod.cjs'), ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText);
const { lodLevel, lodLevelSquared } = createRequire(import.meta.url)(join(directory, 'lod.cjs'));

test('squared-distance LOD retains exact camera detail thresholds', () => {
  for (const role of ['fighter', 'frigate', 'cruiser', 'dreadnought', 'reaper_capital']) {
    for (const length of [0.1, 0.5, 1, 2.5, 11, 40]) {
      const thresholds = role === 'fighter' ? [30, 90] : [Math.max(.5, length) * 70, Math.max(.5, length) * 700];
      const distances = [0, 1, 10, 70, 200, 1000, 50000];
      for (const threshold of thresholds) distances.push(threshold - .001, threshold, threshold + .001);
      for (const distance of distances) {
        assert.equal(lodLevelSquared(distance * distance, length, role), lodLevel(distance, length, role),
          role + ' length=' + length + ' distance=' + distance);
      }
      assert.equal(lodLevelSquared(1e12, length, role, false), 'full');
    }
  }
});

test.after(() => rmSync(directory, { recursive: true, force: true }));
