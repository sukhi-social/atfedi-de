// The catalog's long-form pages, rendered per request from atfedi-content.
//
// The Astro build ships empty shells (catalog/src/components/DocShell.astro)
// and the home page with an empty basics list. Here the Worker fetches the
// markdown from R2, renders it with the same code the build used to
// (catalog/src/lib/tool-page.ts), and fills the shell with HTMLRewriter.
//
//   /basics/<slug>/            content basics/<slug>
//   /build/<tool>/[<page>/]    content tool-pages/<tool>/<page|index>,
//                              for tools whose catalog entry has a `page`
//   /about/                    content about/about
//   /                          the basics cards, from index.json, and the
//                              greeting from pages/home when a person has
//                              sent it from write (the build has the same
//                              words as a fallback)
//   /sitemap.xml               plus every page above
//
// The blog's support and llm pages come from pages/support and pages/llm the
// same way (serveBlogDoc); until a person has sent one from write, the blog
// keeps its own copy.

import { renderToolPage } from '../../catalog/src/lib/tool-page.ts';
import { ui, defaultLocale, localeNames } from '../../catalog/src/i18n/ui.ts';
import { contentIndex, contentFile } from './store.js';

const t = (lang, key) => ui[lang]?.[key] ?? ui[defaultLocale][key] ?? key;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// icons and guides, from the build (catalog/src/pages/site.json.ts)
async function siteData(env, url) {
  const res = await env.ASSETS.fetch(new Request(new URL('/catalog/site.json', url)));
  return res.ok ? await res.json() : { icons: {}, guides: {} };
}

// path → { doc, shell, kicker, title(page), lane } or null
async function resolve(env, url, lang, path) {
  const basic = path.match(/^\/basics\/([a-z0-9-]+)\/$/);
  if (basic) {
    return {
      doc: `basics/${basic[1]}`,
      shell: `/catalog/${lang}/doc-shell/`,
      lane: 'use',
      kicker: t(lang, 'basics.heading'),
      title: (p) => `${p.title} — atfedi.de`,
    };
  }
  if (path === '/about/') {
    return {
      doc: 'about/about',
      shell: `/catalog/${lang}/doc-shell/`,
      lane: 'use',
      kicker: 'atfedi.de',
      title: (p) => `${p.title} — atfedi.de`,
    };
  }
  const guide = path.match(/^(\/(?:use|build)\/[a-z0-9-]+)\/(?:([a-z0-9-]+)\/)?$/);
  if (!guide) return null;
  const site = await siteData(env, url);
  const tool = site.guides[guide[1]];
  if (!tool) return null;
  const sub = guide[2];
  return {
    doc: `${tool.content}/${sub ?? 'index'}`,
    shell: `/catalog/${lang}/${tool.lane}/doc-shell/`,
    lane: tool.lane,
    kicker: sub ? tool.name : `${t(lang, `nav.${tool.lane}`)} · ${t(lang, `cat.${tool.category}`)}`,
    title: (p) => (sub ? `${tool.name}: ${p.title} — atfedi.de` : `${tool.name} — atfedi.de`),
    icons: site.icons,
  };
}

// Who wrote the page, from git history (atfedi-content scripts/build.mjs):
// the people who wrote it, or the AI when no one has rewritten it yet, and
// any AI that helped. Then a way in to rewrite it yourself.
function creditsHtml(lang, doc, credits) {
  const people = credits?.authors?.filter((a) => !a.ai).map((a) => a.name) ?? [];
  const ais = credits?.authors?.filter((a) => a.ai).map((a) => a.name) ?? [];
  const by = people.length ? people : ais;
  const assisted = (credits?.assisted ?? []).filter((n) => !by.includes(n));
  const edit = `https://write.atfedi.de/#${new URLSearchParams({ doc, from: lang, to: lang })}`;
  const parts = [];
  if (by.length) parts.push(`${esc(t(lang, 'credits.by'))} ${by.map(esc).join(', ')}`);
  if (assisted.length) parts.push(`${esc(t(lang, 'credits.assisted'))} ${assisted.map(esc).join(', ')}`);
  parts.push(`<a href="${esc(edit)}">${esc(t(lang, 'credits.edit'))}</a>`);
  return `<p class="doc-credits">${parts.join(' · ')}</p>` + licenseHtml(lang);
}

// Everything in atfedi-content is CC0 (its LICENSE), and the desk asks each
// writer to agree to that before their first send.
function licenseHtml(lang) {
  const deed = `https://creativecommons.org/publicdomain/zero/1.0/deed.${lang}`;
  return `<p class="doc-credits"><a href="${esc(deed)}" rel="license">CC0</a> · ${esc(t(lang, 'license.cc0'))}</p>`;
}

// The shell's head and language switcher still name /doc-shell/; point them
// at the real path.
const fixPath = (shellPath, realPath) => ({
  element(e) {
    for (const attr of ['href', 'content']) {
      const v = e.getAttribute(attr);
      if (v?.includes(shellPath)) e.setAttribute(attr, v.replace(shellPath, realPath));
    }
  },
});

/** A long-form page, or null when the path isn't one (or R2 lacks it). */
export async function serveDocPage(request, env, url, lang, path) {
  const route = await resolve(env, url, lang, path);
  if (!route) return null;
  const [markdown, index] = await Promise.all([
    contentFile(env, route.doc, lang, { published: true }),
    contentIndex(env),
  ]);
  const entry = index.docs.find((d) => d.doc === route.doc);
  if (markdown === null && !entry) return null;
  const credits = entry?.files?.[lang]?.published?.credits;
  const icons = route.icons ?? (await siteData(env, url)).icons;
  const page =
    markdown === null
      ? draftPage(lang, route, entry, path)
      : { ...renderToolPage(markdown, route.kicker, icons), footer: creditsHtml(lang, route.doc, credits) };
  const title = route.title(page);

  const shell = await env.ASSETS.fetch(new Request(new URL(route.shell, url), request));
  if (!shell.ok) return null;
  const shellPath = route.shell.replace(`/catalog/${lang}`, '');

  const out = new HTMLRewriter()
    .on('title', { element: (e) => e.setInnerContent(title) })
    .on('meta[property="og:title"]', { element: (e) => e.setAttribute('content', title) })
    .on('meta[name="description"], meta[property="og:description"]', {
      element: (e) => e.setAttribute('content', page.tagline),
    })
    .on('link, meta[property="og:url"], .lang-switch a', fixPath(shellPath, path))
    .on('[data-doc-grid]', {
      element: (e) => e.setAttribute('style', `--color-lane: var(--color-${route.lane})`),
    })
    .on('[data-doc-body]', { element: (e) => e.setInnerContent(page.html + page.footer, { html: true }) })
    .on('[data-doc-toc]', {
      element: (e) => (page.toc ? e.setInnerContent(page.toc, { html: true }) : e.remove()),
    })
    .on('head', { element: (e) => page.draft && e.append('<meta name="robots" content="noindex">', { html: true }) })
    .transform(shell);
  const headers = new Headers(out.headers);
  headers.set('cache-control', 'public, max-age=60');
  return new Response(out.body, { status: page.draft ? 404 : 200, headers });
}

// "Anyone can join", with the operator's account as a link.
const invite = (lang) =>
  esc(t(lang, 'draft.invite')).replace(
    'kuro_admin',
    '<a href="https://sukhi.f3liz.casa/@kuro_admin">@kuro_admin@sukhi.f3liz.casa</a>',
  );

// A page no person has passed through write yet, in this language. Instead of
// a bare 404: ways in to look the draft over (write) or to bring over a
// version people already passed (translate), and that version to read.
function draftPage(lang, route, entry, path) {
  const doc = route.doc;
  const done = Object.keys(entry.files).filter((l) => l !== lang && entry.files[l].published);
  const from = done[0];
  const title = entry.files[lang]?.published?.title ?? entry.title[lang] ?? entry.files[from]?.published?.title ?? doc;
  const door = (href, head, note) =>
    `<a class="lane-door" data-lane="${esc(route.lane)}" href="${esc(href)}"><h3>${esc(head)}</h3><p>${esc(note)}</p></a>`;
  const doors = [];
  if (entry.files[lang]) {
    const hash = new URLSearchParams({ doc, from: lang, to: lang, ...(from ? { beside: from } : {}) });
    doors.push(door(`https://write.atfedi.de/#${hash}`, t(lang, 'draft.review'), t(lang, 'draft.reviewNote')));
  }
  if (from) {
    const hash = new URLSearchParams({ doc, from, to: lang });
    doors.push(door(`https://translate.atfedi.de/#${hash}`, t(lang, 'draft.translate'), t(lang, 'draft.translateNote')));
  }
  const read = done.map((l) => `<a href="https://${l}.atfedi.de${esc(path)}" hreflang="${l}">${esc(localeNames[l] ?? l)}</a>`);
  const html =
    `<header class="hero"><p class="lane-mark">${esc(route.kicker)}</p>` +
    `<h1>${esc(title)}</h1><p class="tagline">${esc(t(lang, 'draft.lead'))}</p></header>` +
    `<h2>${esc(t(lang, 'draft.fluent'))}</h2><p>${invite(lang)}</p>` +
    (doors.length ? `<div class="doors">${doors.join('')}</div>` : '');
  const footer = read.length ? `<p class="doc-credits">${esc(t(lang, 'draft.read'))} ${read.join(' · ')}</p>` : '';
  return { html, footer, toc: '', title, tagline: t(lang, 'draft.lead'), draft: true };
}

// A page in one language as the site shows it, or null while it's an AI
// draft no one has sent from write yet.
const shown = (d, lang) => d.files?.[lang]?.published ?? null;

// The greeting, from pages/home: `## hello`, the hug, the small line, then
// `### heading` and the intro. A part that is missing keeps the build's words.
function homeParts(html) {
  const hello = html.match(/<h1>([\s\S]*?)<\/h1><p class="tagline">([\s\S]*?)<\/p><\/header>/);
  const small = html.match(/<\/header>\s*<p>([\s\S]*?)<\/p>/);
  const intro = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/);
  return {
    hello: hello?.[1],
    hug: hello?.[2],
    small: small?.[1],
    introHeading: intro?.[1],
    intro: intro?.[2],
  };
}

const swap = (html) => ({ element: (e) => html != null && e.setInnerContent(html, { html: true }) });

/** The home page with its basics cards and greeting filled in. */
export async function serveHome(request, env, url, lang, assetPath) {
  const [res, index, markdown, site] = await Promise.all([
    env.ASSETS.fetch(new Request(new URL(assetPath, url), request)),
    contentIndex(env),
    contentFile(env, 'pages/home', lang, { published: true }),
    siteData(env, url),
  ]);
  if (!res.ok) return res;
  const cards = index.docs
    .filter((d) => d.doc.startsWith('basics/') && shown(d, lang))
    .map(
      (d) =>
        `<a class="lane-door" data-lane="use" href="/basics/${esc(d.doc.slice(7))}/">` +
        `<h3>${esc(shown(d, lang).title)}</h3><p>${esc(shown(d, lang).lead ?? '')}</p></a>`,
    )
    .join('');
  const home = markdown === null ? {} : homeParts(renderToolPage(markdown, '', site.icons).html);
  const credits = index.docs.find((d) => d.doc === 'pages/home')?.files?.[lang]?.published?.credits;
  const out = new HTMLRewriter()
    .on('[data-basics]', { element: (e) => e.setInnerContent(cards, { html: true }) })
    .on('[data-home-hello]', swap(home.hello))
    .on('[data-home-hug]', swap(home.hug))
    .on('[data-home-small]', swap(home.small))
    .on('[data-home-intro-heading]', swap(home.introHeading))
    .on('[data-home-intro]', swap(home.intro))
    .on('[data-home-credits]', { element: (e) => e.setInnerContent(creditsHtml(lang, 'pages/home', credits), { html: true }) })
    .transform(res);
  const headers = new Headers(out.headers);
  headers.set('cache-control', 'public, max-age=60');
  return new Response(out.body, { status: res.status, headers });
}

/**
 * One of the blog's own pages (support, llm) from pages/<name>, or null while
 * no person has sent it from write; then the blog's built copy is served.
 * The built page is the frame: its article gets the words.
 */
export async function serveBlogDoc(request, env, url, lang, name, fetchStatic) {
  const doc = `pages/${name}`;
  const [markdown, index] = await Promise.all([
    contentFile(env, doc, lang, { published: true }),
    contentIndex(env),
  ]);
  if (markdown === null) return null;
  const res = await fetchStatic(request);
  if (!res.ok) return res;
  const site = await siteData(env, url);
  const page = renderToolPage(markdown, '', site.icons);
  const credits = index.docs.find((d) => d.doc === doc)?.files?.[lang]?.published?.credits;
  // the blog's articles use h2 for their sections, with the title as h1
  const body = page.html
    .replace(
      /^<header class="hero">[\s\S]*?<h1>([\s\S]*?)<\/h1><p class="tagline">([\s\S]*?)<\/p><\/header>/,
      '<header class="post-head"><h1>$1</h1></header><p>$2</p>',
    )
    .replace(/<(\/?)h3/g, '<$1h2');
  const out = new HTMLRewriter()
    .on('title', { element: (e) => e.setInnerContent(`${page.title} — atfedi.de blog`) })
    .on('meta[property="og:title"]', { element: (e) => e.setAttribute('content', `${page.title} — atfedi.de blog`) })
    .on('meta[name="description"], meta[property="og:description"]', {
      element: (e) => e.setAttribute('content', page.tagline),
    })
    .on('article.post', { element: (e) => e.setInnerContent(body + creditsHtml(lang, doc, credits), { html: true }) })
    .transform(res);
  const headers = new Headers(out.headers);
  headers.set('cache-control', 'public, max-age=60');
  return new Response(out.body, { status: res.status, headers });
}

/** The sitemap, with the long-form pages added. */
export async function serveSitemap(request, env, url, lang, assetPath) {
  const [res, index, site] = await Promise.all([
    env.ASSETS.fetch(new Request(new URL(assetPath, url), request)),
    contentIndex(env),
    siteData(env, url),
  ]);
  if (!res.ok) return res;
  const byContent = Object.fromEntries(Object.entries(site.guides).map(([p, g]) => [g.content, p]));
  const paths = index.docs
    .filter((d) => shown(d, lang))
    .map((d) => {
      if (d.doc.startsWith('basics/')) return `/basics/${d.doc.slice(7)}/`;
      if (d.doc === 'about/about') return '/about/';
      const m = d.doc.match(/^(tool-pages\/[a-z0-9-]+)\/([a-z0-9-]+)$/);
      const base = m && byContent[m[1]];
      if (!base) return null;
      return m[2] === 'index' ? `${base}/` : `${base}/${m[2]}/`;
    })
    .filter(Boolean);
  const extra = paths.map((p) => `  <url><loc>https://${lang}.atfedi.de${p}</loc></url>\n`).join('');
  const xml = (await res.text()).replace('</urlset>', `${extra}</urlset>`);
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
