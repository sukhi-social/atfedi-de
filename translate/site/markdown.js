// The little bit of markdown the desk understands: splitting into paragraphs,
// coloring the syntax so the prose stands out (Typora-style: the marks fade,
// the words stay), and comparing what a translation must carry over.
//
// highlight() only ever wraps text in spans, never adds or removes a
// character, and changes color rather than size or weight. The editor lays a
// highlighted copy under a transparent textarea, so the two must line up
// glyph for glyph.

// Split markdown into paragraphs at blank lines, keeping fenced blocks
// (``` code, ::: cards) whole even when they contain blank lines.
export function paragraphs(markdown) {
  const blocks = [];
  let current = [];
  let fence = null;
  const flush = () => {
    if (current.length) blocks.push(current.join('\n'));
    current = [];
  };
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const open = line.match(/^(```|:::)/);
    if (fence) {
      current.push(line);
      if (line.trim() === fence) {
        fence = null;
        flush();
      }
    } else if (open) {
      flush();
      fence = open[1];
      current.push(line);
    } else if (line.trim() === '') {
      flush();
    } else {
      current.push(line);
    }
  }
  flush();
  return blocks;
}

// Rows for the two panes. Headings cut each side into sections, and the
// sections pair up in order; inside a section the paragraphs pair up in
// order and the shorter side gets empty rows. So one extra paragraph on
// either side only shifts the rest of its own section, not the whole page.
const isHeading = (block) => /^#{1,6} /.test(block ?? '');
function sections(blocks) {
  const out = [[]];
  for (const b of blocks) {
    if (isHeading(b) && out.at(-1).length) out.push([]);
    out.at(-1).push(b);
  }
  return out;
}
export function align(left, right) {
  const a = sections(left);
  const b = sections(right);
  const pairs = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const l = a[i] ?? [];
    const r = b[i] ?? [];
    for (let j = 0; j < Math.max(l.length, r.length); j++) pairs.push([l[j], r[j]]);
  }
  return pairs;
}

export const isFence = (block) => /^(```|:::)/.test(block ?? '');

// Join a paragraph's wrapped lines into one, the way markdown reads them (a
// lone newline is a space). docs/publishing.md asks for one line per
// paragraph anyway, and hard-wrapped source otherwise shows as ragged breaks
// once the pane wraps it again. Lines that mean something on their own —
// list items, headings, rules — still start a new line, and fences are
// left exactly as they are.
const NO_SPACE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef]/u;

export function unwrap(block) {
  if (block == null || isFence(block)) return block;
  const out = [];
  for (const line of block.split('\n')) {
    const starts = /^\s*(?:[-*+]|\d+\.) |^#{1,6} |^---+$|^>/.test(line);
    if (out.length === 0 || starts) out.push(line);
    else {
      const prev = out[out.length - 1].trimEnd();
      const next = line.trim();
      // Japanese and Chinese have no spaces between words, so a wrap there
      // joins with nothing; everything else (Hangul included) gets a space.
      const tight = NO_SPACE.test(prev.slice(-1)) && NO_SPACE.test(next[0] ?? '');
      out[out.length - 1] = tight ? prev + next : `${prev} ${next}`;
    }
  }
  return out.join('\n');
}

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (cls, t) => `<span class="${cls}">${t}</span>`;

// Inline marks within one line (already escaped).
function inline(line) {
  return line
    .replace(/`[^`]+`/g, (m) => span('md-code', m))
    .replace(/\[icon:[a-z0-9-]+\]/g, (m) => span('md-token', m))
    .replace(
      /\[([^\]\n]+)\]\(([^)\s]+)\)/g,
      (_, label, url) => `${span('md-mark', '[')}${span('md-link', label)}${span('md-mark', '](')}${span('md-url', url)}${span('md-mark', ')')}`,
    )
    .replace(/\*\*([^*\n]+)\*\*/g, (_, t) => `${span('md-mark', '**')}${span('md-strong', t)}${span('md-mark', '**')}`);
}

export function highlight(block) {
  if (isFence(block)) {
    const lines = block.split('\n');
    return lines
      .map((l, i) => (i === 0 || i === lines.length - 1 ? span('md-mark', esc(l)) : inline(esc(l))))
      .join('\n');
  }
  return block
    .split('\n')
    .map((raw) => {
      const line = esc(raw);
      const h = line.match(/^(#{1,6} )(.*)$/);
      if (h) return span('md-mark', h[1]) + span('md-heading', inline(h[2]));
      const li = line.match(/^(\s*(?:[-*+]|\d+\.) )(.*)$/);
      if (li) return span('md-mark', li[1]) + inline(li[2]);
      if (/^---+$/.test(line)) return span('md-mark', line);
      return inline(line);
    })
    .join('\n');
}

// --- what a translation should carry over ------------------------------------

// The parts of a paragraph that aren't prose: they should survive translation
// as they are (or nearly — a link may point at a localized page).
function parts(block) {
  const urls = [...block.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const icons = block.match(/\[icon:[a-z0-9-]+\]/g) ?? [];
  const code = block.match(/`[^`\n]+`/g) ?? [];
  const heading = block.match(/^(#{1,6}) /)?.[1].length ?? 0;
  const items = block.split('\n').filter((l) => /^\s*(?:[-*+]|\d+\.) /.test(l)).length;
  return { urls, icons, code, heading, items };
}

// What the source has that the translation doesn't (multiset difference).
const missing = (a, b) => {
  const left = [...b];
  return a.filter((x) => {
    const i = left.indexOf(x);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
};

/**
 * Compare a source paragraph with its translation. Returns a list of
 * { kind, detail } — empty when nothing looks off, or when there is no
 * translation yet (an empty row isn't a mistake, just unfinished).
 */
export function check(source, target) {
  if (!source || !target?.trim()) return [];
  const a = parts(source);
  const b = parts(target);
  const out = [];
  for (const u of missing(a.urls, b.urls)) out.push({ kind: 'url', detail: u });
  for (const i of missing(a.icons, b.icons)) out.push({ kind: 'icon', detail: i });
  for (const c of missing(a.code, b.code)) out.push({ kind: 'code', detail: c });
  if (a.heading !== b.heading) out.push({ kind: 'heading', detail: `${'#'.repeat(a.heading) || '—'} / ${'#'.repeat(b.heading) || '—'}` });
  if (a.items !== b.items) out.push({ kind: 'items', detail: `${a.items} / ${b.items}` });
  return out;
}
