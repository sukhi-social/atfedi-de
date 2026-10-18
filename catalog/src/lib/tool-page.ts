import { micromark } from 'micromark';

// Renders a tool detail page (src/content/tool-pages/**) from markdown with
// two small extensions on top of CommonMark:
//
//   [icon:name]        an inline Lucide icon (src/assets/lucide/name.svg)
//   :::card … :::      a full-width "door" link-card into a subpage
//   :::cards … :::     a .tool-grid of small cards (See-also style)
//
// The first `## Heading` + paragraph become the page hero (kicker, h1,
// tagline), like the blog's post head. Every h2/h3 and every bold-lead
// paragraph (**Title.** …) gets an id and a table-of-contents entry —
// the same right rail as the blog.

// ---- icons ---------------------------------------------------------------

// Icons arrive as a name → svg map, so this file runs anywhere: the Astro
// build passes the bundled Lucide files (lib/icons.ts), the Worker passes the
// same map fetched from the built site (/icons.json).
export type IconMap = Record<string, string>;

let icons = new Map<string, string>();

const icon = (name: string): string => icons.get(name) ?? '';

const injectIcons = (html: string): string =>
  html.replace(/\[icon:([a-z0-9-]+)\]/g, (_, n) => icon(n));

// ---- card fences ---------------------------------------------------------

const pull = (html: string, re: RegExp): [string, string] => {
  const m = html.match(re);
  return m ? [m[0], html.replace(m[0], '')] : ['', html];
};

// :::card — one line: [icon:x] [Title](href) — description
const doorCard = (inner: string): string => {
  const [svg, rest] = pull(inner, /<svg[\s\S]*?<\/svg>/);
  const link = rest.match(/<a href="([^"]+)">([\s\S]*?)<\/a>/);
  if (!link) return `<p>${inner}</p>`;
  const desc = rest
    .replace(link[0], '')
    .replace(/^[\s—·-]+|[\s—·-]+$/g, '')
    .trim();
  return (
    `<a class="door-card" href="${link[1]}">${svg}` +
    `<span class="door-text"><span class="door-title">${link[2]}</span>` +
    `<span class="door-desc">${desc}</span></span>${icon('arrow-right')}</a>`
  );
};

// :::cards item — [icon:x] **Title** — description — [link](url) [link2](url2)
const gridCard = (inner: string): string => {
  const [svg, rest] = pull(inner, /<svg[\s\S]*?<\/svg>/);
  const [title, rest2] = pull(rest, /<strong>[\s\S]*?<\/strong>/);
  const links = [...rest2.matchAll(/<a href="[^"]+">[\s\S]*?<\/a>/g)].map((m) => m[0]);
  let desc = rest2;
  for (const l of links) desc = desc.replace(l, '');
  desc = desc
    .replace(/^[\s—·-]+|[\s—·-]+$/g, '')
    .replace(/\s+—\s*$/, '')
    .trim();
  // card-title, not a bare h3: keeps card headings out of the page TOC
  return (
    `<li class="tool-card">` +
    `<h3 class="card-title">${svg}${title.replace(/<\/?strong>/g, '')}</h3>` +
    `<p class="tool-summary">${desc}</p>` +
    `<div class="tool-links">${links.join('\n')}</div></li>`
  );
};

const renderFence = (type: string, md: string): string => {
  const html = injectIcons(micromark(md));
  if (type === 'card') {
    const inner = html.match(/<p>([\s\S]*?)<\/p>/);
    return inner ? doorCard(inner[1]) : html;
  }
  const items = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => gridCard(m[1]));
  return `<ul class="tool-grid link-cards">\n${items.join('\n')}\n</ul>`;
};

// ---- hero ----------------------------------------------------------------

const heroize = (
  html: string,
  kicker: string,
): { html: string; title: string; tagline: string } => {
  let title = '';
  let tagline = '';
  html = html.replace(
    /^<h2>([\s\S]*?)<\/h2>\n<p>([\s\S]*?)<\/p>/,
    (_, t: string, lead: string) => {
      title = t.replace(/<[^>]+>/g, '').trim();
      tagline = lead.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      return (
        `<header class="hero"><p class="lane-mark">${kicker}</p>` +
        `<h1>${t}</h1><p class="tagline">${lead}</p></header>`
      );
    },
  );
  // the cover's meta chips: the icon paragraph directly after the hero
  // (runs before icon injection, so it still reads [icon:] notation)
  html = html.replace(
    /(<\/header>)\n<p>(\[icon:[\s\S]*?)<\/p>/,
    '$1\n<p class="meta-row">$2</p>',
  );
  return { html, title, tagline };
};

// ---- table of contents ---------------------------------------------------

const slugify = (t: string): string =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'section';

const tocify = (html: string): { html: string; toc: string } => {
  const heads: { depth: number; id: string; text: string; lead: boolean }[] = [];
  const seen = new Map<string, number>();
  const uniq = (id: string): string => {
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    return n === 0 ? id : `${id}-${n + 1}`;
  };
  // Real headings, plus the bold-lead paragraphs that act as sections on the
  // prose subpages (<p><strong>Title.</strong> …). Bold leads index at h3
  // depth. Card titles carry a class, so the bare-tag match skips them.
  html = html.replace(
    /<(h[23])>([\s\S]*?)<\/\1>|<p><strong>([\s\S]*?)<\/strong>/g,
    (_, tag: string | undefined, inner: string | undefined, lead: string | undefined) => {
      const raw = ((tag ? inner : lead) ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const text = raw.replace(/[.:。．：]$/, '');
      const id = uniq(slugify(text));
      heads.push({ depth: tag ? +tag[1] : 3, id, text, lead: !tag });
      return tag
        ? `<${tag} id="${id}">${inner}</${tag}>`
        : `<p id="${id}"><strong>${lead}</strong>`;
    },
  );
  // Depth is relative: the shallowest real heading on the page is the top
  // level; deeper headings — and bold leads, whenever real headings exist —
  // indent under it. A page with only bold leads stays flat.
  const headingDepths = heads.filter((h) => !h.lead).map((h) => h.depth);
  const minDepth = headingDepths.length > 0 ? Math.min(...headingDepths) : null;
  const isSub = (h: { depth: number; lead: boolean }) =>
    minDepth !== null && (h.lead || h.depth > minDepth);
  const toc =
    heads.length > 1
      ? `<ul>\n` +
        heads
          .map(
            (h) =>
              `<li${isSub(h) ? ' class="toc-sub"' : ''}><a href="#${h.id}">${h.text}</a></li>`,
          )
          .join('\n') +
        `\n</ul>`
      : '';
  return { html, toc };
};

// ---- entry point ----------------------------------------------------------

export interface ToolPage {
  html: string;
  toc: string;
  title: string;
  tagline: string;
}

export const renderToolPage = (markdown: string, kicker: string, iconMap: IconMap): ToolPage => {
  icons = new Map(Object.entries(iconMap));
  // Lift card fences out before micromark, drop rendered HTML back in after.
  const fences: string[] = [];
  const body = markdown.replace(/:::(cards|card)\n([\s\S]*?)\n:::/g, (_, type, md) => {
    fences.push(renderFence(type, md));
    return `%%FENCE${fences.length - 1}%%`;
  });
  // pictures (![alt](/media/…), uploaded from the desk) load as you scroll
  let html = micromark(body).replace(/<img /g, '<img loading="lazy" decoding="async" ');
  const hero = heroize(html, kicker);
  html = injectIcons(hero.html);
  html = html.replace(/<p>%%FENCE(\d+)%%<\/p>/g, (_, i) => fences[+i]);
  const { html: bodyHtml, toc } = tocify(html);
  return { html: bodyHtml, toc, title: hero.title, tagline: hero.tagline };
};
