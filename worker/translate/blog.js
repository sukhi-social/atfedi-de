// write.atfedi.de/blog/ — the blog's own posts, edited from the desk.
//
// The posts are not in atfedi-content. They are .mdoc files in this repo
// (blog/src/content/posts/<lang>/<slug>.mdoc), and the blog is built from them
// when the site is deployed. So this is a separate page, a separate list and a
// separate Send, shown only to the accounts in BLOG_EDITORS (everyone else gets
// a plain 404 for the page and its API).
//
// Send opens a pull request against BLOG_REPO as the person (Author = them,
// Committer = the Worker), never a commit to main: the PR gets the blog's
// preview URL, and the post reaches blog.atfedi.de only after a merge and a
// deploy. Editing only; a new post is still written the usual way.

import { gh, b64, gitIdentity } from '../content/github.js';

const DIRS = new Set(['en', 'ja', 'ko', 'v']);
const MAX_POST = 200000;
const ROOT = 'blog/src/content/posts';

export const isBlogEditor = (env, handle) =>
  !!handle &&
  (env.BLOG_EDITORS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .includes(handle.toLowerCase());

const repoOf = (env) => env.BLOG_REPO ?? 'sukhi-social/atfedi-de';
const branchOf = (env) => env.BLOG_BRANCH ?? 'main';
const valid = (dir, slug) => DIRS.has(dir) && typeof slug === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(slug);

/** [{ dir, slug }] for every post in the repo, newest path last. */
export async function listPosts(env) {
  const tree = await gh(env, 'GET', `/repos/${repoOf(env)}/git/trees/${encodeURIComponent(branchOf(env))}?recursive=1`);
  const re = new RegExp(`^${ROOT}/([a-z]+)/([a-z0-9-]+)\\.mdoc$`);
  return (tree?.tree ?? [])
    .map((t) => t.path.match(re))
    .filter((m) => m && DIRS.has(m[1]))
    .map((m) => ({ dir: m[1], slug: m[2] }));
}

/** One post's source, or null. */
export async function getPost(env, dir, slug) {
  const res = await fetch(
    `https://api.github.com/repos/${repoOf(env)}/contents/${ROOT}/${dir}/${slug}.mdoc?ref=${encodeURIComponent(branchOf(env))}`,
    {
      headers: {
        authorization: `Bearer ${env.CONTENT_GITHUB_TOKEN}`,
        accept: 'application/vnd.github.raw+json',
        'user-agent': 'atfedi.de write',
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`github contents: ${res.status}`);
  return await res.text();
}

// A post the blog can still build: front matter with the fields its schema
// asks for (blog/src/content.config.ts).
function problem(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return 'frontmatter';
  for (const key of ['title', 'description', 'date', 'author']) {
    if (!new RegExp(`^${key}:\\s*\\S`, 'm').test(m[1])) return `frontmatter: ${key}`;
  }
  return null;
}

/** Open a pull request that rewrites one post. Returns { url, number }. */
export async function sendPost(env, { handle, dir, slug, text }) {
  const repo = repoOf(env);
  const main = branchOf(env);
  const enc = encodeURIComponent;
  const path = `${ROOT}/${dir}/${slug}.mdoc`;

  const head = await gh(env, 'GET', `/repos/${repo}/git/ref/heads/${enc(main)}`);
  const base = await gh(env, 'GET', `/repos/${repo}/git/commits/${head.object.sha}`);
  const blob = await gh(env, 'POST', `/repos/${repo}/git/blobs`, { content: b64(text), encoding: 'base64' });
  const tree = await gh(env, 'POST', `/repos/${repo}/git/trees`, {
    base_tree: base.tree.sha,
    tree: [{ path, mode: '100644', type: 'blob', sha: blob.sha }],
  });
  const now = new Date().toISOString();
  const title = `Edit blog post ${dir}/${slug}`;
  const commit = await gh(env, 'POST', `/repos/${repo}/git/commits`, {
    message: title,
    tree: tree.sha,
    parents: [head.object.sha],
    author: { ...gitIdentity(handle), date: now },
    committer: { name: 'atfedi.de write', email: 'write@atfedi.de', date: now },
  });
  const who = handle.replace(/^@/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const branch = `write/${who}/blog-${dir}-${slug}-${Date.now().toString(36)}`;
  await gh(env, 'POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
  const note = 'It reaches blog.atfedi.de after a merge and a deploy.';
  const pr = await gh(env, 'POST', `/repos/${repo}/pulls`, {
    title,
    head: branch,
    base: main,
    body: `Sent from write.atfedi.de/blog by ${handle}.\n\n${note}`,
  });
  // the preview address needs the number, which exists only now
  await gh(env, 'PATCH', `/repos/${repo}/pulls/${pr.number}`, {
    body: `Sent from write.atfedi.de/blog by ${handle}.\n\nPreview: https://blog.atfedi.de/v/preview/pr-${pr.number}/-/${dir}/${slug}\n\n${note}`,
  });
  return { url: pr.html_url, number: pr.number };
}

/**
 * The /blog/ page and /api/blog/* for write.atfedi.de, or null when the path
 * isn't theirs. Anyone who isn't an editor gets a 404, as if it weren't there.
 */
export async function handleBlogDesk(request, env, handle, json) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path !== '/blog' && !path.startsWith('/blog/') && !path.startsWith('/api/blog/')) return null;
  const notFound = () => new Response('Not found', { status: 404, headers: { 'x-robots-tag': 'noindex' } });
  if (!isBlogEditor(env, handle)) return path.startsWith('/api/') ? json({ error: 'not found' }, 404) : notFound();
  if (path.startsWith('/blog')) return undefined; // the static page; the caller serves it

  if (path === '/api/blog/posts') return json(await listPosts(env));

  if (path === '/api/blog/post') {
    const dir = url.searchParams.get('dir');
    const slug = url.searchParams.get('slug');
    if (!valid(dir, slug)) return json({ error: 'bad request' }, 400);
    const text = await getPost(env, dir, slug);
    return text === null ? json({ error: 'not found' }, 404) : json({ text });
  }

  if (path === '/api/blog/send') {
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    if (request.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403);
    if (!env.CONTENT_GITHUB_TOKEN) return json({ error: 'not set up' }, 503);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'bad json' }, 400);
    }
    const { dir, slug, text } = body ?? {};
    if (!valid(dir, slug) || typeof text !== 'string' || text.length > MAX_POST) return json({ error: 'bad request' }, 400);
    const bad = problem(text);
    if (bad) return json({ error: bad }, 400);
    if ((await getPost(env, dir, slug)) === null) return json({ error: 'unknown post' }, 404);
    try {
      return json(await sendPost(env, { handle, dir, slug, text: `${text.trim()}\n` }));
    } catch (e) {
      console.error(e);
      return json({ error: 'failed' }, 502);
    }
  }
  return json({ error: 'not found' }, 404);
}
