// translate.atfedi.de and write.atfedi.de — one desk for the long-form pages,
// paragraph by paragraph: a page on the left, your words on the right. On
// translate the right side is another language; on write it is the same one,
// rewritten in your own voice. "Send" commits it to atfedi-content as you
// (../content/github.js).
//
// The desk itself is static (translate/site). The pages it offers come from
// atfedi-content through R2 (/docs.json, /content/...), the same copy the
// site reads. The Worker adds the login (any fediverse account — see auth.js)
// and each person's drafts. Reading needs no login; saving a draft does.

import { handleLogin, handleCallback, handleLogout, sessionHandle } from './auth.js';
import { listDrafts, putDraft, clearDrafts, putSend, getSend } from './store.js';
import { contentIndex, contentFile, serveMedia, stageMedia, stagedMedia, MEDIA_TYPES } from '../content/store.js';
import { sendPage } from '../content/github.js';

const LANGS = new Set(['en', 'ja', 'ko']);
const MAX_INDEX = 2000;
const MAX_FILE = 200000;
const MAX_IMAGE = 5 * 1024 * 1024; // the desk shrinks pictures first; this is a backstop

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// 'basics/moving', 'tool-pages/fedify/roadmap', 'posts/two-directions'
const validDoc = (doc) => typeof doc === 'string' && /^[a-z0-9-]+(\/[a-z0-9-]+){1,3}$/.test(doc);

export async function handleTranslate(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/login') return handleLogin(request, env);
  if (path === '/callback') return handleCallback(request, env);
  if (path === '/logout') return handleLogout(request, env);

  if (path === '/docs.json') {
    const index = await contentIndex(env);
    const docs = index.docs.map((d) => ({
      doc: d.doc,
      title: d.title,
      repoPath: Object.fromEntries(Object.entries(d.files).map(([lang, f]) => [lang, f.path])),
    }));
    return json(docs);
  }

  const file = path.match(/^\/content\/(.+)\.([a-z]{2})\.md$/);
  if (file) {
    const text = await contentFile(env, file[1], file[2]);
    if (text === null) return new Response('Not found', { status: 404 });
    return new Response(text, {
      headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-cache' },
    });
  }

  // pictures in the pages, sent ones and ones still waiting to be sent
  const media = path.match(/^\/media\/([^/]+)$/);
  if (media) return (await serveMedia(env, media[1], { staging: true })) ?? new Response('Not found', { status: 404 });

  // A picture, uploaded the moment it's dropped in, while you keep writing.
  // It waits in staging/ until the page that uses it is sent.
  if (path === '/api/upload') {
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    if (request.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403);
    const handle = await sessionHandle(request, env);
    if (!handle) return json({ error: 'login' }, 401);
    const type = (request.headers.get('content-type') ?? '').split(';')[0];
    const ext = Object.keys(MEDIA_TYPES).find((k) => MEDIA_TYPES[k] === type);
    if (!ext) return json({ error: 'type' }, 415);
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE) return json({ error: 'size' }, 413);
    const name = await stageMedia(env, bytes, ext);
    return json({ src: `/media/${name}` });
  }

  if (path === '/api/me') {
    return json({ handle: await sessionHandle(request, env) });
  }

  if (path === '/api/drafts') {
    const handle = await sessionHandle(request, env);
    if (!handle) return json({ error: 'login' }, 401);

    if (request.method === 'GET') {
      const doc = url.searchParams.get('doc');
      const lang = url.searchParams.get('lang');
      if (!validDoc(doc) || !LANGS.has(lang)) return json({ error: 'bad request' }, 400);
      return json({ drafts: await listDrafts(env.FEDI_DB, doc, lang, handle) });
    }

    if (request.method === 'PUT') {
      // Same-origin only: the cookie is SameSite=Lax, and this check keeps a
      // cross-site form from writing into someone's drafts.
      if (request.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'bad json' }, 400);
      }
      const { doc, lang, idx, text } = body ?? {};
      if (
        !validDoc(doc) ||
        !LANGS.has(lang) ||
        !Number.isInteger(idx) ||
        idx < 0 ||
        idx > MAX_INDEX ||
        typeof text !== 'string' ||
        text.length > MAX_FILE // write keeps the whole page in one draft
      ) {
        return json({ error: 'bad request' }, 400);
      }
      await putDraft(env.FEDI_DB, { doc, lang, idx, handle, text: text.trim() });
      return json({ ok: true });
    }

    return json({ error: 'method' }, 405);
  }

  if (path === '/api/send') {
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    if (request.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403);
    const handle = await sessionHandle(request, env);
    if (!handle) return json({ error: 'login' }, 401);
    if (!env.CONTENT_GITHUB_TOKEN) return json({ error: 'not set up' }, 503);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'bad json' }, 400);
    }
    const { doc, lang, text } = body ?? {};
    if (!validDoc(doc) || !LANGS.has(lang) || typeof text !== 'string' || text.length > MAX_FILE) {
      return json({ error: 'bad request' }, 400);
    }
    // the same rule atfedi-content's check enforces, so main never breaks
    if (!/^## \S/.test(text.trimStart())) return json({ error: 'title' }, 400);
    const index = await contentIndex(env);
    if (!index.docs.some((d) => d.doc === doc)) return json({ error: 'unknown page' }, 404);

    // Answer now; the commit (a handful of GitHub calls) happens after the
    // response, and the desk reads how it went from /api/sends/<id>.
    const id = crypto.randomUUID();
    await putSend(env.FEDI_DB, { id, handle, doc, lang, status: 'sending' });
    const work = (async () => {
      try {
        const sent = await sendPage(env, {
          handle,
          doc,
          lang,
          path: `content/${doc}.${lang}.md`,
          text: `${text.trim()}\n`,
          staged: (name) => stagedMedia(env, name),
        });
        await putSend(env.FEDI_DB, { id, handle, doc, lang, status: sent.published ? 'published' : 'proposed', url: sent.url });
        await clearDrafts(env.FEDI_DB, doc, lang, handle);
      } catch (e) {
        console.error(e);
        await putSend(env.FEDI_DB, { id, handle, doc, lang, status: 'failed' });
      }
    })();
    if (ctx?.waitUntil) ctx.waitUntil(work);
    else await work;
    return json({ id }, 202);
  }

  const sendStatus = path.match(/^\/api\/sends\/([0-9a-f-]{36})$/);
  if (sendStatus) {
    const handle = await sessionHandle(request, env);
    if (!handle) return json({ error: 'login' }, 401);
    const row = await getSend(env.FEDI_DB, sendStatus[1], handle);
    return row ? json(row) : json({ error: 'not found' }, 404);
  }

  // everything else: the static desk
  let assetPath = path;
  if (!assetPath.endsWith('/') && !/\.[^/]+$/.test(assetPath)) assetPath += '/';
  const res = await env.ASSETS.fetch(new Request(new URL(`/translate${assetPath}`, request.url), request));
  const headers = new Headers(res.headers);
  headers.set('x-robots-tag', 'noindex');
  return new Response(res.body, { status: res.status, headers });
}
