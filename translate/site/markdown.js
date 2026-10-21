// The little bit of markdown the desk understands: splitting into paragraphs,
// coloring the syntax so the prose stands out (Typora-style: the marks fade,
// the words stay), and comparing what a translation must carry over.
//
// highlight() only ever wraps text in spans, never adds or removes a
// character, and changes color rather than size or weight. The editor lays a
// highlighted copy under a transparent textarea, so the two must line up
// glyph for glyph.

// A line that is only a Markdoc tag: {% callout %}, {% /callout %}, or a
// self-closing {% image src="…" /%} on its own. Such a line is a block of its
// own, so the prose inside a callout still pairs up paragraph by paragraph.
const TAG_LINE = /^\s*\{%\s*\/?[a-z][a-z0-9-]*\b[^%]*%\}\s*$/;

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
    } else if (TAG_LINE.test(line)) {
      flush();
      blocks.push(line.trim());
    } else if (line.trim() === '') {
      flush();
    } else {
      current.push(line);
    }
  }
  flush();
  return blocks;
}

// Rows for the two panes. Headings cut each side into sections, the sections
// are matched up with the headings as anchors, and inside a matched pair the
// paragraphs pair up in order, the shorter side getting empty rows. So an
// extra paragraph on either side only shifts the rest of its own section.
//
// Sections usually match one to one, but a language may merge two sections
// or split one (or lack a heading), and pairing by position would then run
// every later section one off. So they're matched like two texts are
// compared: same heading level scores, so does a similar size and the same
// links and icons, and a section with no partner faces an empty one.
const isHeading = (block) => /^#{1,6} /.test(block ?? '');
const levelOf = (section) => (isHeading(section[0]) ? section[0].match(/^#+/)[0].length : 0);
function sections(blocks) {
  const out = [[]];
  for (const b of blocks) {
    if (isHeading(b) && out.at(-1).length) out.push([]);
    out.at(-1).push(b);
  }
  return out.filter((sec) => sec.length);
}

// links, icons and code a section carries over from one language to the next
const marks = (section) =>
  new Set(section.join('\n').match(/https?:\/\/[^\s)]+|\[icon:[a-z0-9-]+\]|`[^`]+`/g) ?? []);

function affinity(a, b) {
  if (levelOf(a) !== levelOf(b)) return -1;
  let score = 10;
  score -= Math.min(4, Math.abs(a.length - b.length));
  const ma = marks(a);
  const mb = marks(b);
  for (const m of ma) if (mb.has(m)) score += 2;
  return score;
}

export function align(left, right) {
  const a = sections(left);
  const b = sections(right);
  const GAP = -3;
  // best[i][j]: the best score for the first i and j sections
  const best = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) best[i][0] = i * GAP;
  for (let j = 1; j <= b.length; j++) best[0][j] = j * GAP;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      best[i][j] = Math.max(
        best[i - 1][j - 1] + affinity(a[i - 1], b[j - 1]),
        best[i - 1][j] + GAP,
        best[i][j - 1] + GAP,
      );
    }
  }
  // walk back, preferring to pair when it ties
  const matched = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && best[i][j] === best[i - 1][j - 1] + affinity(a[i - 1], b[j - 1])) {
      matched.push([a[--i], b[--j]]);
    } else if (i > 0 && best[i][j] === best[i - 1][j] + GAP) {
      matched.push([a[--i], []]);
    } else {
      matched.push([[], b[--j]]);
    }
  }
  const pairs = [];
  for (const [l, r] of matched.reverse()) {
    for (let k = 0; k < Math.max(l.length, r.length); k++) pairs.push([l[k], r[k]]);
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
    .replace(/\[icon:[a-z0-9-]+\]|\{% icon [^%]*%\}/g, (m) => span('md-token', m))
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
      if (TAG_LINE.test(raw)) return span('md-mark', line);
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
  // both spellings of an icon count as the same icon
  const icons = [
    ...(block.match(/\[icon:[a-z0-9-]+\]/g) ?? []),
    ...[...block.matchAll(/\{% icon name="([a-z0-9-]+)" \/%\}/g)].map((m) => `[icon:${m[1]}]`),
  ];
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
