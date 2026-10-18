// Builds translate.atfedi.de: the desk is static, so this copies site/ to
// ../dist/translate/. The pages it offers are not built in: the Worker serves
// them from atfedi-content's R2 copy (/docs.json, /content/...).

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'dist', 'translate');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(here, 'site'), out, { recursive: true });
console.log('translate: built');
