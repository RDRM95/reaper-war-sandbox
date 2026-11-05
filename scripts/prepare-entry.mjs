// Keep the source entry separate from the compiled index published by GitHub Pages.
import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
copyFileSync(resolve(root, 'index.source.html'), resolve(root, 'index.html'));
