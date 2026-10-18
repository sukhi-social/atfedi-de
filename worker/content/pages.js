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
//   /                          the basics cards, from index.json
//   /sitemap.xml               plus every page above

import { renderToolPage } from '../../catalog/src/lib/tool-page.ts';
import { ui, defaultLocale } from '../../catalog/src/i18n/ui.ts';
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

// The shell's head still names /doc-shell/; point it at the real path.
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
  const markdown = await contentFile(env, route.doc, lang);
  if (markdown === null) return null;
  const icons = route.icons ?? (await siteData(env, url)).icons;
  const page = renderToolPage(markdown, route.kicker, icons);
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
    .on('link, meta[property="og:url"]', fixPath(shellPath, path))
    .on('[data-doc-grid]', {
      element: (e) => e.setAttribute('style', `--color-lane: var(--color-${route.lane})`),
    })
    .on('[data-doc-body]', { element: (e) => e.setInnerContent(page.html, { html: true }) })
    .on('[data-doc-toc]', {
      element: (e) => (page.toc ? e.setInnerContent(page.toc, { html: true }) : e.remove()),
    })
    .transform(shell);
  const headers = new Headers(out.headers);
  headers.set('cache-control', 'public, max-age=60');
  return new Response(out.body, { status: 200, headers });
}

/** The home page with its basics cards filled in. */
export async function serveHome(request, env, url, lang, assetPath) {
  const [res, index] = await Promise.all([
    env.ASSETS.fetch(new Request(new URL(assetPath, url), request)),
    contentIndex(env),
  ]);
  if (!res.ok) return res;
  const cards = index.docs
    .filter((d) => d.doc.startsWith('basics/') && d.title[lang])
    .map(
      (d) =>
        `<a class="lane-door" data-lane="use" href="/basics/${esc(d.doc.slice(7))}/">` +
        `<h3>${esc(d.title[lang])}</h3><p>${esc(d.lead?.[lang] ?? '')}</p></a>`,
    )
    .join('');
  const out = new HTMLRewriter()
    .on('[data-basics]', { element: (e) => e.setInnerContent(cards, { html: true }) })
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
    .filter((d) => d.title[lang])
    .map((d) => {
      if (d.doc.startsWith('basics/')) return `/basics/${d.doc.slice(7)}/`;
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
