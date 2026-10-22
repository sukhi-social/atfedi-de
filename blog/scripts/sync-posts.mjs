// The blog's posts live in atfedi-content (content/posts/<slug>.<lang>.md).
// Before every build this brings the ones a person has sent from write
// (its publish gate: the site shows only those) into
// src/content/posts/<lang>/<slug>.mdoc, where the content collection reads
// them. That folder is generated and ignored by git; edit the posts in
// atfedi-content, or at write.atfedi.de/blog/.
//
//   node scripts/sync-posts.mjs
//
// Where it reads from:
//   ATFEDI_CONTENT_DIR   a checkout of atfedi-content to use as it is
//   otherwise            a clone of CONTENT_REPO at CONTENT_REF (default main)
//                        kept in blog/.content/, brought up to date each run
//
// Building atfedi-content's dist/ needs its full git history, which is also
// where "sent from write" is read from, so the clone is not shallow.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toMdoc } from '../../shared/posts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const blog = join(here, '..');
const out = join(blog, 'src', 'content', 'posts');
const repo = process.env.CONTENT_REPO ?? 'https://github.com/sukhi-social/atfedi-content';
const ref = process.env.CONTENT_REF ?? 'main';

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });

function checkout() {
  if (process.env.ATFEDI_CONTENT_DIR) return process.env.ATFEDI_CONTENT_DIR;
  const dir = join(blog, '.content');
  if (existsSync(join(dir, '.git'))) {
    run('git', ['fetch', '--quiet', 'origin', ref], dir);
  } else {
    rmSync(dir, { recursive: true, force: true });
    run('git', ['clone', '--quiet', repo, dir]);
    run('git', ['fetch', '--quiet', 'origin', ref], dir);
  }
  run('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], dir);
  return dir;
}

const dir = checkout();
run('node', ['scripts/build.mjs'], dir);

const shown = join(dir, 'dist', 'published', 'content', 'posts');
const files = existsSync(shown) ? readdirSync(shown).filter((f) => f.endsWith('.md')) : [];
// An empty blog is never what a deploy means; stop before it ships one.
if (!files.length) {
  console.error('sync-posts: atfedi-content has no sent posts (content/posts). Not touching the blog.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
for (const file of files) {
  const m = file.match(/^([a-z0-9-]+)\.([a-z]{2})\.md$/);
  if (!m) throw new Error(`sync-posts: unexpected file ${file}`);
  const [, slug, lang] = m;
  mkdirSync(join(out, lang), { recursive: true });
  writeFileSync(join(out, lang, `${slug}.mdoc`), toMdoc(readFileSync(join(shown, file), 'utf8')));
}
console.log(`sync-posts: ${files.length} posts from ${dir}`);
