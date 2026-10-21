import Markdoc, { type Config, type Node, type RenderableTreeNode } from '@markdoc/markdoc';

// (a default import: the package is CommonJS, and plain node can't take
// named values from it)
const { Tag, Ast } = Markdoc;
type Tag = InstanceType<typeof Markdoc.Tag>;

// Renders a long-form page (atfedi-content) with Markdoc, which is CommonMark
// plus tags, so a plain markdown page renders as it always did. The tags a
// page can use:
//
//   {% icon name="x" /%}        an inline Lucide icon (src/assets/lucide/x.svg)
//   {% callout %} … {% /callout %}
//                               a boxed aside; type="warning" for things that
//                               can't be undone (note is the default)
//   {% card %} … {% /card %}    a full-width "door" link-card into a subpage:
//                               one line, icon, link, description
//   {% cards %} … {% /cards %}  a .tool-grid of small cards, one list item
//                               each: icon, **Title**, description, links
//   {% table %} … {% /table %}  and plain pipe tables, for small reference tables
//
// Two older spellings still work, because the pages already use them:
//   [icon:name]                 = {% icon name="name" /%}
//   :::card … :::, :::cards … :::
//                               = {% card %}…{% /card %}, {% cards %}…{% /cards %}
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

// A name with no svg draws a small dot instead of nothing, so the row keeps its
// place and the text still lines up with its neighbours.
const dot =
  '<svg class="i" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2.5"/></svg>';

const icon = (name: string): string => {
  const svg = icons.get(name);
  if (svg) return svg;
  console.warn(`unknown icon: ${name} (add src/assets/lucide/${name}.svg)`);
  return dot;
};

// The icon tag renders a placeholder (Markdoc escapes raw svg); it is swapped
// for the svg once the page is HTML.
const injectIcons = (html: string): string =>
  html.replace(/<i data-icon="([a-z0-9-]+)"><\/i>/g, (_, n) => icon(n));

// ---- the older spellings -------------------------------------------------

// Rewrites [icon:x] and ::: fences into tags, leaving fenced code and
// inline code alone.
const legacy = (markdown: string): string => {
  let code = false;
  return markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      if (/^```/.test(line)) code = !code;
      if (code || /^```/.test(line)) return line;
      const fence = line.match(/^:::(cards|card)\s*$/);
      if (fence) return `{% ${fence[1]} %}`;
      if (line.trim() === ':::') return '{% /fence %}';
      return line
        .split(/(`[^`]*`)/)
        .map((part, i) => (i % 2 ? part : part.replace(/\[icon:([a-z0-9-]+)\]/g, '{% icon name="$1" /%}')))
        .join('');
    })
    .join('\n')
    .replace(/\{% (cards|card) %\}([\s\S]*?)\{% \/fence %\}/g, '{% $1 %}$2{% /$1 %}');
};

// ---- cards ---------------------------------------------------------------

// Trims the space and the dash that separate a card's parts from its description (left
// where the title and links were lifted out), then renders what is left.
const description = (nodes: Node[], config: Config): RenderableTreeNode[] => {
  const kept = nodes.slice();
  const blank = (n?: Node) => n?.type === 'text' && !String(n.attributes.content).trim();
  while (blank(kept[0])) kept.shift();
  while (blank(kept[kept.length - 1])) kept.pop();
  const trim = (at: number, re: RegExp) => {
    const n = kept[at];
    if (n?.type === 'text') {
      const content = String(n.attributes.content).replace(re, '');
      kept[at] = new Ast.Node('text', { content });
    }
  };
  trim(0, /^[\s—·-]+/);
  trim(kept.length - 1, /[\s—·-]+$/);
  return new Ast.Node('inline', {}, kept).transformChildren(config);
};

// the pieces of a card's one line: [icon] [link] or **strong**, the rest
const inlineOf = (node: Node): Node[] => {
  const p = node.walk ? [...node.walk()].find((n) => n.type === 'inline') : undefined;
  return p ? p.children : [];
};

const takeIcon = (nodes: Node[]): [RenderableTreeNode, Node[]] => {
  const at = nodes.findIndex((n) => n.type === 'tag' && n.tag === 'icon');
  if (at < 0) return ['', nodes];
  return [new Tag('i', { 'data-icon': nodes[at].attributes.name }), nodes.filter((_, i) => i !== at)];
};

// {% card %} — one line: icon, [Title](href), description
const doorCard = (node: Node, config: Config): RenderableTreeNode => {
  const [svg, rest] = takeIcon(inlineOf(node));
  const at = rest.findIndex((n) => n.type === 'link');
  if (at < 0) return new Tag('p', {}, new Ast.Node('inline', {}, rest).transformChildren(config));
  const link = rest[at];
  const desc = description(rest.filter((_, i) => i !== at), config);
  return new Tag('a', { class: 'door-card', href: link.attributes.href }, [
    svg,
    new Tag('span', { class: 'door-text' }, [
      new Tag('span', { class: 'door-title' }, link.transformChildren(config)),
      new Tag('span', { class: 'door-desc' }, desc),
    ]),
    new Tag('i', { 'data-icon': 'arrow-right' }),
  ]);
};

// {% cards %} item — icon, **Title**, description, links
const gridCard = (item: Node, config: Config): RenderableTreeNode => {
  const nodes = item.children.flatMap((c) => (c.type === 'inline' ? c.children : (c.children[0]?.children ?? [])));
  const [svg, rest] = takeIcon(nodes);
  const at = rest.findIndex((n) => n.type === 'strong');
  const title = at >= 0 ? rest[at].transformChildren(config) : [];
  const links = rest.filter((n) => n.type === 'link');
  const others = rest.filter((n, i) => i !== at && n.type !== 'link');
  return new Tag('li', { class: 'tool-card' }, [
    new Tag('h3', { class: 'card-title' }, [svg, ...title]),
    new Tag('p', { class: 'tool-summary' }, description(others, config)),
    new Tag('div', { class: 'tool-links' }, links.map((l) => new Tag('a', { href: l.attributes.href }, l.transformChildren(config)))),
  ]);
};

// ---- the tags ------------------------------------------------------------

const config: Config = {
  tags: {
    icon: {
      inline: true,
      selfClosing: true,
      attributes: { name: { type: String, required: true } },
      transform: (node) => new Tag('i', { 'data-icon': node.attributes.name }),
    },
    callout: {
      attributes: { type: { type: String, default: 'note', matches: ['note', 'warning'] } },
      transform: (node, config) =>
        new Tag('aside', { class: `callout callout-${node.transformAttributes(config).type}` }, node.transformChildren(config)),
    },
    card: {
      transform: (node, config) => doorCard(node, config),
    },
    cards: {
      transform: (node, config) => {
        const list = node.children.find((c) => c.type === 'list');
        const items = (list?.children ?? []).map((item) => gridCard(item, config));
        return new Tag('ul', { class: 'tool-grid link-cards' }, items);
      },
    },
  },
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
  // (runs before icon injection, so the icons are still placeholders)
  html = html.replace(
    /(<\/header>)\n<p>(<i data-icon=[\s\S]*?)<\/p>/,
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
  const tree = Markdoc.transform(Markdoc.parse(legacy(markdown)), config);
  const blocks = Array.isArray((tree as Tag).children) ? (tree as Tag).children : [tree];
  // pictures (![alt](/media/…), uploaded from the desk) load as you scroll
  let html = blocks
    .map((b) => Markdoc.renderers.html(b))
    .join('\n')
    .replace(/<img /g, '<img loading="lazy" decoding="async" ');
  const hero = heroize(html, kicker);
  html = injectIcons(hero.html);
  // a bold lead inside a callout is its warning, not a section: keep the
  // callouts out of the table of contents
  const callouts: string[] = [];
  html = html.replace(/<aside class="callout[\s\S]*?<\/aside>/g, (m) => `%%CALLOUT${callouts.push(m) - 1}%%`);
  const tocked = tocify(html);
  const toc = tocked.toc;
  const bodyHtml = tocked.html.replace(/%%CALLOUT(\d+)%%/g, (_, i) => callouts[+i]);
  return { html: bodyHtml, toc, title: hero.title, tagline: hero.tagline };
};
