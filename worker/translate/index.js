// translate.atfedi.de — a desk for translating the long-form pages paragraph
// by paragraph: the source on the left, your language on the right.
//
// The pages themselves are static (translate/ builds them, with every source
// markdown file and an index, into dist/translate/). The Worker adds only the
// login (any fediverse account — see auth.js) and each person's drafts.
// Reading needs no login; saving a draft does.

import { handleLogin, handleCallback, handleLogout, sessionHandle } from './auth.js';
import { listDrafts, putDraft } from './store.js';

const LANGS = new Set(['en', 'ja', 'ko']);
const MAX_PARAGRAPH = 20000;
const MAX_INDEX = 2000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// 'basics/moving', 'tool-pages/fedify/roadmap', 'posts/two-directions'
const validDoc = (doc) => typeof doc === 'string' && /^[a-z0-9-]+(\/[a-z0-9-]+){1,3}$/.test(doc);

export async function handleTranslate(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/login') return handleLogin(request, env);
  if (path === '/callback') return handleCallback(request, env);
  if (path === '/logout') return handleLogout(request, env);

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
        text.length > MAX_PARAGRAPH
      ) {
        return json({ error: 'bad request' }, 400);
      }
      await putDraft(env.FEDI_DB, { doc, lang, idx, handle, text: text.trim() });
      return json({ ok: true });
    }

    return json({ error: 'method' }, 405);
  }

  // everything else: the static desk
  let assetPath = path;
  if (!assetPath.endsWith('/') && !/\.[^/]+$/.test(assetPath)) assetPath += '/';
  const res = await env.ASSETS.fetch(new Request(new URL(`/translate${assetPath}`, request.url), request));
  const headers = new Headers(res.headers);
  headers.set('x-robots-tag', 'noindex');
  return new Response(res.body, { status: res.status, headers });
}
