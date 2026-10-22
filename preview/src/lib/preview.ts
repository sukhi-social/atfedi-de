// Live preview — load the blog straight from GitHub at a given ref.
//
// Used by the SSR route src/pages/v/preview/[...path].astro.
//   /v/preview/{ref}/-/                 → the root, redirects to a locale
//   /v/preview/{ref}/-/{lang}/          → that locale's home (post list)
//   /v/preview/{ref}/-/{lang}/{slug}    → one post
//
// {ref} is a branch name, or `pr-{number}` for a pull request (which may
// live in a fork). `/-/` separates the ref from the content path, so a
// branch name may contain slashes.
//
// Posts render with Markdoc's core renderer. Its default tokenizer keeps
// markdown-it's `html: false`, so raw HTML in a post is escaped to text —
// a PR's contents are not trusted.

import { toMdoc } from '@atfedi/shared/posts';
import Markdoc, { type RenderableTreeNode, type NodeType, type Schema } from '@markdoc/markdoc';
import GithubSlugger from 'github-slugger';
import { createHighlighterCore, createCssVariablesTheme, type HighlighterCore } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';

// The posts live in atfedi-content, where the write desk sends them. A PR may
// live in a fork — resolveRef returns the head.
const REPO = { owner: 'sukhi-social', repo: 'atfedi-content' };
// A post is content/posts/{slug}.{lang}.md; shared/posts.mjs turns it into the
// .mdoc the blog builds from.
const POSTS_BASE = 'content/posts';
// The writers' profiles stay in the site's repo (and aren't part of a ref).
const SITE = { owner: 'f3liz-casa', repo: 'atfedi-de', sha: 'main', label: 'main' };
const LOCALES = ['en', 'ja', 'ko'];
const DEFAULT_LOCALE = 'en';

interface Source {
  owner: string;
  repo: string;
  sha: string;
  label: string;
}

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
}

export interface PreviewHeading {
  depth: number;
  slug: string;
  text: string;
}

export type PreviewResult =
  | { kind: 'redirect'; to: string }
  | { kind: 'home'; ref: string; refLabel: string; lang: string; posts: PostMeta[] }
  | {
      kind: 'post';
      ref: string;
      refLabel: string;
      lang: string;
      slug: string;
      title: string;
      date: string;
      html: string;
      headings: PreviewHeading[];
      authorIsAi: boolean;
    }
  | {
      kind: 'error';
      status: number;
      message: string;
      detail?: string;
      ref?: string;
      lang?: string;
      slug?: string;
    };

// Best supported locale from an Accept-Language header, else the default.
function pickLocale(header: string | null): string {
  if (header) {
    for (const part of header.split(',')) {
      const code = part.split(';')[0].trim().slice(0, 2).toLowerCase();
      if (LOCALES.includes(code)) return code;
    }
  }
  return DEFAULT_LOCALE;
}

// The .mdoc frontmatter is a few plain key: value lines — title,
// description, date. A small line parser is enough; no YAML library.
function parseFrontmatter(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim();
    // toMdoc writes titles as JSON strings; the other values are plain
    if (v.startsWith('"')) {
      try {
        out[m[1]] = JSON.parse(v);
        continue;
      } catch {
        // not JSON after all: fall through
      }
    }
    out[m[1]] = v.replace(/^["']|["']$/g, '');
  }
  return out;
}

// The frontmatter block from a raw .mdoc, without parsing the body.
function frontmatterOf(raw: string): Record<string, string> {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return parseFrontmatter(m ? m[1] : '');
}

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': 'atfedi-de-preview',
    Accept: 'application/vnd.github+json',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

// A ref → where its content actually lives. `pr-{n}` asks GitHub for the
// PR's head; anything else is a branch name. Not pinned → short cache.
async function resolveRef(ref: string, token?: string): Promise<Source | null> {
  const cf = { cacheTtl: 30, cacheEverything: true };
  const headers = ghHeaders(token);

  const pr = ref.match(/^pr-(\d+)$/);
  if (pr) {
    const r = await fetch(
      `https://api.github.com/repos/${REPO.owner}/${REPO.repo}/pulls/${pr[1]}`,
      { headers, cf } as RequestInit,
    );
    if (!r.ok) return null;
    const data: any = await r.json();
    if (!data.head?.repo) return null;
    return {
      owner: data.head.repo.owner.login,
      repo: data.head.repo.name,
      sha: data.head.sha,
      label: `PR #${pr[1]} · ${data.head.ref}`,
    };
  }

  const r = await fetch(
    `https://api.github.com/repos/${REPO.owner}/${REPO.repo}/commits/${ref}`,
    { headers, cf } as RequestInit,
  );
  if (!r.ok) return null;
  const data: any = await r.json();
  return { owner: REPO.owner, repo: REPO.repo, sha: data.sha, label: ref };
}

// A file at a pinned SHA — immutable, so it caches for a long time.
async function fetchRaw(src: Source, repoPath: string): Promise<string | null> {
  const r = await fetch(
    `https://raw.githubusercontent.com/${src.owner}/${src.repo}/${src.sha}/${repoPath}`,
    { cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit,
  );
  if (!r.ok) return null;
  return r.text();
}

// The post slugs written in a language at a ref. [] if the folder is absent;
// null on any other failure (so the home can tell "empty" from "broken").
async function listSlugs(
  src: Source,
  lang: string,
  token?: string,
): Promise<string[] | null> {
  const r = await fetch(
    `https://api.github.com/repos/${src.owner}/${src.repo}/contents/${POSTS_BASE}?ref=${src.sha}`,
    {
      headers: ghHeaders(token),
      cf: { cacheTtl: 86400, cacheEverything: true },
    } as RequestInit,
  );
  if (r.status === 404) return [];
  if (!r.ok) return null;
  const data: any = await r.json();
  if (!Array.isArray(data)) return [];
  const suffix = `.${lang}.md`;
  return data
    .filter((e) => e.type === 'file' && e.name.endsWith(suffix))
    .map((e) => e.name.slice(0, -suffix.length));
}

// Whether a post's author is flagged ai: true — the author entry lives in the
// site's repo, with English as the fallback locale (like the blog itself).
async function authorIsAi(src: Source, lang: string, id: string): Promise<boolean> {
  if (!/^[\w-]+$/.test(id)) return false;
  for (const l of [lang, 'en']) {
    const raw = await fetchRaw(src, `blog/src/content/authors/${l}/${id}.mdoc`);
    if (raw !== null) return frontmatterOf(raw).ai === 'true';
  }
  return false;
}

// --- headings ------------------------------------------------------------
// The static blog gets heading ids from @astrojs/markdoc; here the heading
// node is overridden to do the same (github-slugger, like Astro), and the
// h2/h3 entries are collected for the table of contents.

function textOf(node: RenderableTreeNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (node !== null && typeof node === 'object' && 'children' in node && Array.isArray(node.children))
    return node.children.map(textOf).join('');
  return '';
}

function headingNodeFor(slugger: GithubSlugger, headings: PreviewHeading[]): Schema {
  return {
    children: ['inline'] as NodeType[],
    attributes: {
      id: { type: String },
      level: { type: Number, required: true, default: 1 },
    },
    transform(node: any, config: any) {
      const children = node.transformChildren(config);
      const level: number = node.attributes.level;
      const slug = slugger.slug(children.map(textOf).join(''));
      if (level === 2 || level === 3)
        headings.push({ depth: level, slug, text: children.map(textOf).join('') });
      return new Markdoc.Tag(`h${level}`, { id: slug }, children);
    },
  };
}

// --- syntax highlighting --------------------------------------------------
// Markdoc's html renderer emits <pre data-language="…">escaped</pre>; those
// are re-rendered with shiki using the same css-variables theme as the blog
// (the colors come from blog.css's --astro-code-* definitions).

let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [createCssVariablesTheme({ name: 'css-variables', variablePrefix: '--astro-code-' })],
    langs: [
      import('@shikijs/langs/typescript'),
      import('@shikijs/langs/shellscript'),
      import('@shikijs/langs/json'),
      import('@shikijs/langs/graphql'),
    ],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighter;
}

function unescapeHtml(text: string): string {
  return text
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

async function highlightFences(html: string): Promise<string> {
  const fence = /<pre data-language="([^"]+)">([\s\S]*?)<\/pre>/g;
  if (!fence.test(html)) return html;
  fence.lastIndex = 0;

  const hl = await getHighlighter();
  const loaded = new Set(hl.getLoadedLanguages());

  let out = '';
  let last = 0;
  for (const m of html.matchAll(fence)) {
    const [raw, lang, body] = m;
    out += html.slice(last, m.index);
    last = m.index + raw.length;
    if (loaded.has(lang)) {
      out += hl.codeToHtml(unescapeHtml(body).replace(/\n$/, ''), {
        lang,
        theme: 'css-variables',
      });
    } else {
      out += raw;
    }
  }
  return out + html.slice(last);
}

// pathParam is the [...path] — `{ref}/-/{lang}/{slug}` (slug optional).
export async function loadPreview(
  pathParam: string,
  token: string | undefined,
  acceptLanguage: string | null,
): Promise<PreviewResult> {
  // `/-/` separates ref from content path. At the bare root the URL is
  // `{ref}/-/`, and the rest param arrives with its trailing slash gone
  // as `{ref}/-` — so accept that too, with an empty content path.
  let ref: string;
  let rawRest: string;
  const sep = pathParam.indexOf('/-/');
  if (sep !== -1) {
    ref = pathParam.slice(0, sep);
    rawRest = pathParam.slice(sep + 3);
  } else if (pathParam.endsWith('/-')) {
    ref = pathParam.slice(0, -2);
    rawRest = '';
  } else {
    return {
      kind: 'error',
      status: 400,
      message: 'Expected /v/preview/{ref}/-/{lang}/{slug}.',
    };
  }
  const rest = rawRest.replace(/^\/+|\/+$/g, '').replace(/\.mdoc$/, '');

  if (!ref || rest.includes('..')) {
    return { kind: 'error', status: 400, message: 'That ref or path looks unsafe.', ref };
  }

  // the root → redirect to a locale home (like the real blog's bare /)
  if (rest === '') {
    return { kind: 'redirect', to: `/v/preview/${ref}/-/${pickLocale(acceptLanguage)}/` };
  }

  const slash = rest.indexOf('/');
  const lang = slash === -1 ? rest : rest.slice(0, slash);
  const slug = slash === -1 ? '' : rest.slice(slash + 1);

  let src: Source | null;
  try {
    src = await resolveRef(ref, token);
  } catch {
    src = null;
  }
  if (!src) {
    return {
      kind: 'error',
      status: 404,
      message:
        'Could not resolve that ref — no such branch or PR (or GitHub is rate-limiting).',
      detail: ref,
      ref,
      lang,
      slug,
    };
  }

  // a locale home — list the posts written in that language
  if (slug === '') {
    if (!LOCALES.includes(lang)) {
      return { kind: 'error', status: 404, message: `Unknown locale "${lang}".`, ref };
    }
    const slugs = await listSlugs(src, lang, token);
    if (slugs === null) {
      return {
        kind: 'error',
        status: 502,
        message: 'Could not list posts for this ref.',
        ref,
        lang,
      };
    }
    const posts = (
      await Promise.all(
        slugs.map(async (s): Promise<PostMeta | null> => {
          const md = await fetchRaw(src!, `${POSTS_BASE}/${s}.${lang}.md`);
          if (md === null) return null;
          let fm: Record<string, string>;
          try {
            fm = frontmatterOf(toMdoc(md));
          } catch {
            return { slug: s, title: s, date: '' };
          }
          return { slug: s, title: fm.title || s, date: fm.date || '' };
        }),
      )
    ).filter((p): p is PostMeta => p !== null);
    posts.sort((a, b) => b.date.localeCompare(a.date));
    return { kind: 'home', ref, refLabel: src.label, lang, posts };
  }

  // a single post
  const md = await fetchRaw(src, `${POSTS_BASE}/${slug}.${lang}.md`);
  if (md === null) {
    return {
      kind: 'error',
      status: 404,
      message: 'No post at that path on this ref.',
      detail: `${POSTS_BASE}/${slug}.${lang}.md`,
      ref,
      lang,
      slug,
    };
  }

  try {
    const ast = Markdoc.parse(toMdoc(md));
    const fm = parseFrontmatter((ast.attributes.frontmatter as string) || '');
    // default config plus heading ids; no custom tags, raw HTML escaped
    const headings: PreviewHeading[] = [];
    const transformed = Markdoc.transform(ast, {
      nodes: { heading: headingNodeFor(new GithubSlugger(), headings) },
    });
    const html = await highlightFences(Markdoc.renderers.html(transformed));
    const ai = fm.author ? await authorIsAi(SITE, lang, fm.author) : false;
    return {
      kind: 'post',
      ref,
      refLabel: src.label,
      lang,
      slug,
      title: fm.title || slug,
      date: fm.date || '',
      html,
      headings,
      authorIsAi: ai,
    };
  } catch (e) {
    return {
      kind: 'error',
      status: 502,
      message: `Markdoc could not render this post: ${(e as Error).message}`,
      ref,
      lang,
      slug,
    };
  }
}
