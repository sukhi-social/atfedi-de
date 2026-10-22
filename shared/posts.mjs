// The blog's posts, in the two shapes they take.
//
// In atfedi-content a post is an ordinary page the write desk can open:
//
//   content/posts/<slug>.<lang>.md
//
//   ---
//   description: …          front matter: everything but the title
//   date: 2026-07-08
//   author: shiro_mudita
//   ---
//
//   ## The title            the title is the page's `## Title`, as on every page
//
//   Body. Its headings sit one level lower (### for sections), like the rest
//   of the content.
//
// In the blog's build a post is an .mdoc with the title in its front matter and
// ## for sections (blog/src/content/posts/<lang>/<slug>.mdoc). These two
// functions turn one into the other, losslessly:
// the blog's sync step (blog/scripts/sync-posts.mjs) and the live preview use
// toMdoc, and the move out of the blog used fromMdoc.

const FRONT = /^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

// shift the headings of a body by one level, leaving fenced code alone
function shift(body, by) {
  let fence = null;
  return body
    .split('\n')
    .map((line) => {
      const f = line.match(/^\s*(```+|~~~+)/);
      if (f) {
        if (!fence) fence = f[1][0];
        else if (f[1][0] === fence) fence = null;
        return line;
      }
      if (fence) return line;
      if (by > 0) return line.replace(/^(#{1,5})(?= \S)/, '$1#');
      return line.replace(/^#(#{1,5})(?= \S)/, '$1');
    })
    .join('\n');
}

/** A post as the blog's build wants it → a page for atfedi-content. */
export function fromMdoc(mdoc) {
  const m = mdoc.match(FRONT);
  if (!m) throw new Error('no front matter');
  const lines = m[1].split('\n');
  const at = lines.findIndex((l) => l.startsWith('title:'));
  if (at < 0) throw new Error('no title');
  const title = lines[at].slice('title:'.length).trim();
  lines.splice(at, 1);
  const body = mdoc.slice(m[0].length).replace(/^\s+/, '');
  return `---\n${lines.join('\n')}\n---\n\n## ${title}\n\n${shift(body.trimEnd(), +1)}\n`;
}

/** A page from atfedi-content → the .mdoc the blog's build reads. */
export function toMdoc(md) {
  const m = md.match(FRONT);
  if (!m) throw new Error('no front matter');
  const rest = md.slice(m[0].length).replace(/^\s+/, '');
  const head = rest.match(/^## (\S[^\n]*)\n?/);
  if (!head) throw new Error('no "## Title" after the front matter');
  const body = rest.slice(head[0].length).replace(/^\s+/, '');
  // JSON strings are valid YAML, so a title with a colon or a quote is safe
  return `---\ntitle: ${JSON.stringify(head[1].trim())}\n${m[1]}\n---\n\n${shift(body.trimEnd(), -1)}\n`;
}

/** The front matter of a post page as { key: value } (plain `key: value` lines). */
export function metaOf(md) {
  const m = md.match(FRONT);
  const out = {};
  for (const line of (m ? m[1] : '').split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}
