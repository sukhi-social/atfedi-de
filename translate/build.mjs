// Builds translate.atfedi.de: copies site/ to ../dist/translate/, plus every
// long-form source file it can offer and an index of them (docs.json).
//
// A "doc" is one page in all its languages, named by its path without the
// language: basics/moving ← catalog/src/content/basics/moving.{lang}.md.
// Blog posts are left out on purpose: the build carries drafts that aren't
// on the site yet (live_posts decides), and this desk is public.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'dist', 'translate');

// [docs prefix, directory] — every *.{en,ja,ko}.md under the directory.
const SOURCES = [
  ['basics', 'catalog/src/content/basics'],
  ['tool-pages', 'catalog/src/content/tool-pages'],
];

const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      )
    : [];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(here, 'site'), out, { recursive: true });

const docs = new Map();
for (const [prefix, dir] of SOURCES) {
  for (const file of walk(join(root, dir))) {
    const m = relative(join(root, dir), file).match(/^(.+)\.(en|ja|ko)\.md$/);
    if (!m) continue;
    const [, name, lang] = m;
    const doc = `${prefix}/${name}`;
    const markdown = readFileSync(file, 'utf8');
    const target = join(out, 'content', `${doc}.${lang}.md`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, markdown);

    const entry = docs.get(doc) ?? { doc, title: {}, repoPath: {} };
    entry.title[lang] = markdown.match(/^## (.+)$/m)?.[1] ?? name;
    entry.repoPath[lang] = relative(root, file);
    docs.set(doc, entry);
  }
}

const list = [...docs.values()].sort((a, b) => a.doc.localeCompare(b.doc));
writeFileSync(join(out, 'docs.json'), JSON.stringify(list, null, 1));
console.log(`translate: ${list.length} docs`);
