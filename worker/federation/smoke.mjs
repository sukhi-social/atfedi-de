// A smoke run over the federation layer, off the Cloudflare edge.
//
// Everything here talks to the real thing: real fedify, real dispatchers, the
// real built manifest. Only the two edges the Worker gets from the platform are
// stood in for — D1 becomes node:sqlite loaded with our own schema.sql, and
// ASSETS becomes a fetch that hands back dist/blog/ap/manifest.json. So what
// this checks is our code and whichever fedify we're pinned to, which is the
// point: run it after bumping the library, before deploying.
//
//   pnpm --filter worker run test     (needs the blog built first)
//
// It doesn't reach the network, and it never writes outside memory.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';

const HERE = new URL('./', import.meta.url);
const MANIFEST = new URL('../../dist/blog/ap/manifest.json', HERE);

if (!existsSync(MANIFEST)) {
  console.error(
    'No built manifest at dist/blog/ap/manifest.json — run `pnpm --filter blog run build` first.',
  );
  process.exit(1);
}

const { handleFederation } = await import(new URL('./index.js', HERE).href);

// --- the two stand-ins ---------------------------------------------------

// D1's shape over an in-memory sqlite: prepare().bind().first()/.all()/.run(),
// plus the batch() the cascade deletes use.
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('./schema.sql', HERE), 'utf8'));

class Stmt {
  constructor(sql, args = []) {
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    return new Stmt(this.sql, args);
  }
  async first(column) {
    const row = sqlite.prepare(this.sql).get(...this.args) ?? null;
    return column == null ? row : (row?.[column] ?? null);
  }
  async all() {
    return { results: sqlite.prepare(this.sql).all(...this.args), success: true };
  }
  async run() {
    sqlite.prepare(this.sql).run(...this.args);
    return { success: true };
  }
}

const DB = {
  prepare: (sql) => new Stmt(sql),
  batch: async (stmts) => {
    for (const s of stmts) await s.run();
    return [];
  },
};

const manifest = readFileSync(MANIFEST, 'utf8');
const env = {
  FEDI_DB: DB,
  ASSETS: {
    fetch: async (req) =>
      new URL(req.url).pathname === '/blog/ap/manifest.json'
        ? new Response(manifest, { headers: { 'content-type': 'application/json' } })
        : new Response('not found', { status: 404 }),
  },
  SUKHI_BASE_URL: 'https://sukhi.f3liz.casa',
};

const AP = 'application/activity+json';
const get = (path, accept = AP) =>
  handleFederation(
    new Request('https://blog.atfedi.de' + path, { headers: { accept } }),
    env,
    { waitUntil: () => {} },
  );

// --- checks --------------------------------------------------------------

let passed = 0;
let failed = 0;
const ok = (what, condition, saw = '') => {
  if (condition) {
    passed++;
    console.log('  ok   ' + what);
  } else {
    failed++;
    console.log('  FAIL ' + what + (saw ? ' — ' + saw : ''));
  }
};

// Whoever the blog's authors are today; the checks shouldn't need editing when
// that list changes.
const { writers, posts } = JSON.parse(manifest);
const writer = writers[0]?.id;
const post = posts.find((p) => p.author === writer);
if (!writer || !post) {
  console.error('The manifest carries no writers or no posts — nothing to check.');
  process.exit(1);
}

{
  const res = await get(`/.well-known/webfinger?resource=acct:${writer}@blog.atfedi.de`, '*/*');
  const body = res.ok ? await res.json() : null;
  ok('webfinger answers', res.status === 200, String(res.status));
  ok(
    'webfinger points at the actor',
    body?.links?.some(
      (l) => l.rel === 'self' && l.href === `https://blog.atfedi.de/ap/actors/${writer}`,
    ),
  );
}

{
  const res = await get(`/ap/actors/${writer}`);
  const doc = res.ok ? await res.json() : null;
  ok('actor answers', res.status === 200, String(res.status));
  ok('actor id is its own URI', doc?.id === `https://blog.atfedi.de/ap/actors/${writer}`);
  ok('actor carries the RSA key Mastodon checks', !!doc?.publicKey?.publicKeyPem);
  ok('actor carries an Ed25519 assertionMethod', (doc?.assertionMethod?.length ?? 0) > 0);
  ok(
    'actor carries the shared inbox',
    doc?.endpoints?.sharedInbox === 'https://blog.atfedi.de/ap/inbox',
  );
}

{
  // Keys are minted on first sight and read back after — not re-minted, which
  // would change our identity under every remote follower.
  await get(`/ap/actors/${writer}`);
  const { results } = await DB.prepare('SELECT handle FROM actors').all();
  ok('keys are minted once', results.length === 1, `${results.length} actor rows`);
}

ok('a handle we do not host is 404', (await get('/ap/actors/nobody')).status === 404);

{
  const res = await get(`/ap/actors/${writer}/articles/${post.slug}`);
  const doc = res.ok ? await res.json() : null;
  ok('article answers', res.status === 200, String(res.status));
  ok('article carries its body', (doc?.content?.length ?? 0) > 100);
  ok(
    'article is attributed to its writer',
    doc?.attributedTo === `https://blog.atfedi.de/ap/actors/${writer}`,
  );
}

ok('outbox answers', (await get(`/ap/actors/${writer}/outbox`)).status === 200);
ok('followers answers', (await get(`/ap/actors/${writer}/followers`)).status === 200);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
