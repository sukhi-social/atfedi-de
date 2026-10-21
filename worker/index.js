// atfedi.de — the dispatcher Worker.
//
// Routes every request by hostname:
//   {locale}.atfedi.de  → the catalog's {locale} subtree (static assets)
//   blog.atfedi.de      → the blog (static assets)
//   translate.atfedi.de → translate long-form pages paragraph by paragraph
//   write.atfedi.de     → the same desk, for rewriting a page in your own words
//   console.atfedi.de   → the back room: publishing, and kiosk's hand tagging
//                         (the one host behind a login — see console/index.js)
//   atfedi.de           → detect the browser language and redirect to a
//                         subdomain; old /{lang}/* path URLs 301 to it
//
// The built catalog lives in the assets under /catalog/{locale}/... ; the
// shared build assets (/_astro/, favicon) sit at /catalog/ with no locale.
//
// The blog is all static assets, but /v/preview/* is rendered on demand —
// that route is its own one-route SSR project (../preview). Its Astro
// build emits a Worker (../dist/preview/server/entry.mjs) which is bundled
// in here at deploy time and handed every /v/preview/* request. The
// preview's client assets (CSS, fonts) are merged into the blog's /_astro/
// at build time, so the served preview page finds them like any blog page.

import previewSSR from '../dist/preview/server/entry.mjs';
import { handleFederation } from './federation/index.js';
import { handlePublish } from './federation/publish.js';
import { handleComments } from './federation/comments.js';
import { handleRead } from './federation/read.js';
import { sweepTick, backfillMeta, freshenTick } from './kiosk/sweep.js';
import { handlePapers } from './kiosk/papers.js';
import { handleKioskFederation, followTick } from './kiosk/federation.js';
import { handleComments as handleKioskComments } from './kiosk/comments.js';
import { handleInstance } from './kiosk/instance.js';
import { renderReadPage } from './kiosk/render.js';
import { handleConsole } from './console/index.js';
import { handleYumFederation, backfillTick as yumBackfillTick } from './yum/federation.js';
import { handlePlaces } from './yum/places.js';
import { handleYumEditor } from './yum/editor.js';
import { handleDash } from './dash/index.js';
import { handleTranslate } from './translate/index.js';
import { serveBlogDoc, serveDocPage, serveHome, serveSitemap } from './content/pages.js';
import { serveMedia } from './content/store.js';
import { serveBlogPage } from './blog/live.js';

const LOCALES = ['en', 'ja', 'ko'];
const DEFAULT_LOCALE = 'en';

// Best supported locale from an Accept-Language header, else the default.
function pickLocale(header) {
  if (header) {
    for (const part of header.split(',')) {
      const code = part.split(';')[0].trim().slice(0, 2).toLowerCase();
      if (LOCALES.includes(code)) return code;
    }
  }
  return DEFAULT_LOCALE;
}

// Serve a static asset. Hashed build assets (/_astro/) never change under
// the same name, so those get a long immutable cache; everything else keeps
// the platform default (revalidate every time).
async function serveAsset(env, url, path, request) {
  const res = await env.ASSETS.fetch(new Request(new URL(path, url), request));
  // /_astro/ は Astro、/_app/immutable/ は SvelteKit(museum)のハッシュ付き資産
  const immutable =
    url.pathname.startsWith('/_astro/') ||
    url.pathname.startsWith('/_app/immutable/');
  if (res.ok && immutable) {
    const headers = new Headers(res.headers);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    return new Response(res.body, { status: res.status, headers });
  }
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname;
    const sub = host.split('.')[0];

    // --- apex: atfedi.de ---
    if (host === 'atfedi.de') {
      // @yum@atfedi.de — the food map's actor, the apex's second resident. It
      // keeps its own fedify instance and its own paths (/ap/yum/...), so kiosk
      // is untouched; the one place they'd collide is WebFinger, which both
      // would answer, so that is dispatched on who is being asked for.
      const finger = url.searchParams.get('resource') ?? '';
      if (
        url.pathname.startsWith('/ap/yum/') ||
        (url.pathname === '/.well-known/webfinger' &&
          /^acct:yum@atfedi\.de$/i.test(finger.trim()))
      ) {
        return handleYumFederation(request, env, ctx);
      }

      // @kiosk@atfedi.de lives here — the newsstand's actor. WebFinger and its
      // ActivityPub paths are served from the apex so the handle domain and the
      // actor's home match. fedify owns these.
      if (
        url.pathname.startsWith('/ap/') ||
        url.pathname === '/.well-known/webfinger' ||
        url.pathname === '/.well-known/nodeinfo' ||
        url.pathname === '/.well-known/host-meta'
      ) {
        return handleKioskFederation(request, env, ctx);
      }
      // old path-based URLs (atfedi.de/ja/...) → 301 to the subdomain
      const old = url.pathname.match(/^\/(en|ja|ko)(\/.*)?$/);
      if (old) {
        return Response.redirect(
          `https://${old[1]}.atfedi.de${old[2] || '/'}${url.search}`,
          301,
        );
      }
      // otherwise → detect the browser language and send there
      const locale = pickLocale(request.headers.get('accept-language'));
      return Response.redirect(
        `https://${locale}.atfedi.de${url.pathname}${url.search}`,
        302,
      );
    }

    // --- {locale}.atfedi.de: serve the catalog ---
    if (LOCALES.includes(sub)) {
      let path = url.pathname;
      // pictures in the long-form pages, from atfedi-content via R2
      if (path.startsWith('/media/')) {
        return (await serveMedia(env, path.slice(7))) ?? new Response('Not found', { status: 404 });
      }
      const isSharedAsset =
        path.startsWith('/_astro/') || path === '/favicon.svg';

      if (isSharedAsset) {
        path = `/catalog${path}`;
      } else {
        // a page — normalise to the trailing-slash form, then prefix the locale
        if (!path.endsWith('/') && !/\.[^/]+$/.test(path)) path += '/';
        const page = path;
        path = `/catalog/${sub}${path}`;

        // The long-form pages and the basics list come from atfedi-content
        // (R2), rendered into shells the build left empty — content/pages.js.
        if (page.endsWith('/doc-shell/')) return new Response('Not found', { status: 404 });
        if (page === '/') return serveHome(request, env, url, sub, path);
        if (page === '/sitemap.xml/' || url.pathname === '/sitemap.xml') {
          return serveSitemap(request, env, url, sub, `/catalog/${sub}/sitemap.xml`);
        }
        const doc = await serveDocPage(request, env, url, sub, page);
        if (doc) return doc;
      }
      return serveAsset(env, url, path, request);
    }

    // --- kiosk.atfedi.de: the newsstand — read a paper from elsewhere ---
    // Same shape as the blog: path-based locales, the shell shared from blog/.
    if (host === 'kiosk.atfedi.de') {
      let path = url.pathname;
      // Fetch + sanitize a remote AP object for the reader page (client fetch).
      if (path === '/ap/read') return handleRead(request, env, ctx);
      // The rack — the gathered Articles, newest first.
      if (path === '/papers') return handlePapers(request, env);
      // Comments (replies) on a paper — fetched from its origin, sanitized.
      if (path === '/ap/comments') return handleKioskComments(request, env, ctx);
      // Look up a reader's home instance (name + icon) for the reply picker.
      if (path === '/ap/instance') return handleInstance(request, env);
      // shared build assets pass straight through
      if (path.startsWith('/_astro/') || path === '/favicon.svg') {
        return serveAsset(env, url, `/kiosk${path}`, request);
      }
      // pages live under a locale; anything else → detect language, redirect
      const langMatch = path.match(/^\/(en|ja|ko)(\/|$)/);
      if (!langMatch) {
        const locale = pickLocale(request.headers.get('accept-language'));
        return Response.redirect(`https://kiosk.atfedi.de/${locale}/`, 302);
      }
      if (!path.endsWith('/') && !/\.[^/]+$/.test(path)) path += '/';
      const shell = await serveAsset(env, url, `/kiosk${path}`, request);
      // A paper opened from the rack arrives as ?url= on a locale page. Render it
      // into the shell so there's no fetch-and-flash on arrival; if it can't be
      // shaped, fall through to the plain shell (the client fetches /ap/read and
      // shows its own status, exactly as before).
      if (request.method === 'GET' && shell.ok && url.searchParams.has('url')) {
        const ssr = await renderReadPage(request, env, ctx, shell, url.searchParams.get('url'), langMatch[1]);
        if (ssr) return ssr;
      }
      return shell;
    }

    // --- danro.atfedi.de: a one-page intro for the danro-talk widget ---
    if (host === 'danro.atfedi.de') {
      let path = url.pathname;
      if (!path.endsWith('/') && !/\.[^/]+$/.test(path)) path += '/';
      return serveAsset(env, url, `/danro${path}`, request);
    }

    // --- yum.atfedi.de: おいしい、を分けあう食マップ(単ページ、danro と同じ) ---
    if (host === 'yum.atfedi.de') {
      let path = url.pathname;
      // ピンは fediverse から届く(worker/yum/)。まだ一つも無いうちは null が
      // 返り、site/places.json の種がそのまま出る。
      if (path === '/places.json') {
        const pins = await handlePlaces(env);
        if (pins) return pins;
      }
      // /editor ── sukhi アカウントでログインした人だけの back room(手で
      // ピンを足す・直す・消す、Naver フォルダの取り込み)。
      if (
        path === '/login' ||
        path === '/callback' ||
        path === '/logout' ||
        path === '/editor' ||
        path.startsWith('/editor/') ||
        path.startsWith('/api/')
      ) {
        return handleYumEditor(request, env, ctx);
      }
      if (!path.endsWith('/') && !/\.[^/]+$/.test(path)) path += '/';
      return serveAsset(env, url, `/yum${path}`, request);
    }

    // --- museum.atfedi.de: 博物街(SvelteKit static、パス先頭が言語) ---
    if (host === 'museum.atfedi.de') {
      let path = url.pathname;
      const isRootFile =
        path === '/sitemap.xml' || path === '/robots.txt' ||
        path === '/favicon.svg' || path.startsWith('/_app/');
      // 言語なしで来たら、ブラウザの言語の入り口へ(古い /section/... も拾う)
      if (!isRootFile && !/^\/(en|ja|ko)(\/|$)/.test(path)) {
        const locale = pickLocale(request.headers.get('accept-language'));
        return Response.redirect(
          `https://museum.atfedi.de/${locale}${path === '/' ? '/' : path}${url.search}`,
          302,
        );
      }
      if (!path.endsWith('/') && !/\.[^/]+$/.test(path)) path += '/';
      return serveAsset(env, url, `/museum${path}`, request);
    }

    // --- console.atfedi.de: the back room (everything behind a login) ---
    if (host === 'console.atfedi.de') {
      return handleConsole(request, env, ctx);
    }

    // --- dash.atfedi.de: the front door to the back rooms ---
    if (host === 'dash.atfedi.de') {
      return handleDash(request, env, ctx);
    }

    // --- translate.atfedi.de / write.atfedi.de: the long-form desk, paragraph
    // by paragraph. Open to any fediverse account (see translate/auth.js).
    if (host === 'translate.atfedi.de' || host === 'write.atfedi.de') {
      return handleTranslate(request, env, ctx);
    }

    // --- blog.atfedi.de: serve the blog (path-based locales) ---
    if (host === 'blog.atfedi.de') {
      let path = url.pathname;
      // The publishing desk moved to console.atfedi.de, and the login with it —
      // the session cookie now lives on that host alone. Old bookmarks still
      // land somewhere sensible.
      if (['/ap/login', '/ap/callback', '/ap/logout', '/ap/studio'].includes(path)) {
        return Response.redirect('https://console.atfedi.de/', 302);
      }
      // Publishing an Article — the one authorized action (sukhi OAuth2). The
      // console calls its own copy of this; what's left here is the bearer-token
      // path, for publishing from a script rather than the desk.
      if (path === '/ap/publish' && request.method === 'POST') {
        return handlePublish(request, env, ctx);
      }
      // Comments for a post — read by the (static) article page on the client.
      if (path === '/ap/comments') {
        return handleComments(request, env);
      }
      // Look up a reader's home instance for the "reply on your instance" picker.
      if (path === '/ap/instance') return handleInstance(request, env);
      // ActivityPub: the actor documents, WebFinger, inbox, outbox. fedify
      // owns these paths; everything else on the blog stays static.
      if (
        path.startsWith('/ap/') ||
        path === '/.well-known/webfinger' ||
        path === '/.well-known/nodeinfo' ||
        path === '/.well-known/host-meta'
      ) {
        return handleFederation(request, env, ctx);
      }
      // /v/ is the live preview, and nothing else — the preview is an
      // SSR route, so hand it to the preview project's Astro worker
      if (path.startsWith('/v/preview/')) {
        return previewSSR.fetch(request, env, ctx);
      }
      if (path.startsWith('/v/')) {
        return new Response(
          'preview only — use /v/preview/{ref}/-/{lang}/{slug}',
          { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } },
        );
      }
      // shared build assets and root-level crawler files pass straight through
      if (path.startsWith('/_astro/') || path === '/favicon.svg' || path === '/robots.txt') {
        return serveAsset(env, url, `/blog${path}`, request);
      }
      // pages live under a locale; anything else → detect language, redirect
      if (path !== '/sitemap.xml' && !/^\/(en|ja|ko)(\/|$)/.test(path)) {
        const locale = pickLocale(request.headers.get('accept-language'));
        return Response.redirect(`https://blog.atfedi.de/${locale}/`, 302);
      }
      if (!path.endsWith('/') && !/\.[^/]+$/.test(path)) path += '/';
      // The build holds every post, drafts too; what's on the site is decided
      // in D1, and the pages (and the sitemap) are served minus the rest.
      // support and llm are written in write (atfedi-content pages/<name>);
      // the built page is the fallback until a person has sent them
      const own = path.match(/^\/(en|ja|ko)\/(support|llm)\/$/);
      if (own) {
        const page = await serveBlogDoc(request, env, url, own[1], own[2], (req) =>
          serveAsset(env, url, `/blog${path}`, req),
        );
        if (page) return page;
      }
      return serveBlogPage(env, path, request, (req) =>
        serveAsset(env, url, `/blog${path}`, req),
      );
    }

    return new Response('Not found', { status: 404 });
  },

  // The cron tick — kiosk gathers a little each time: walk a few outboxes for
  // the back-catalogue (sweep.js), and follow a few new writers so their fresh
  // Articles push into the inbox (federation.js). Gentle, over many ticks.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        // yum first, and deliberately: it re-reads at most two kept DMs and
        // needs a handful of fetches, while kiosk's sweep is happy to spend
        // everything an invocation has. Behind it, yum was starving.
        await yumBackfillTick(env, ctx);
        await sweepTick(env, ctx);
        await followTick(env, ctx);
        await backfillMeta(env, ctx);
        await freshenTick(env, ctx);
      })(),
    );
  },
};
