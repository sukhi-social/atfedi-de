import type { Locale } from '../i18n/ui';

// The basics pages: src/content/basics/{slug}.{lang}.md. Every slug must
// exist in every locale — a missing file fails the build rather than
// quietly showing another language.
const sources = import.meta.glob('/src/content/basics/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// In the order they appear on the home page.
export const basicSlugs = ['moving'] as const;

export const basicSource = (slug: string, lang: Locale): string => {
  const markdown = sources[`/src/content/basics/${slug}.${lang}.md`];
  if (markdown === undefined) {
    throw new Error(`missing basics content: ${slug}.${lang}.md`);
  }
  return markdown;
};

// The page's own `## Title` and lead paragraph, for cards that link to it.
export const basicCard = (slug: string, lang: Locale): { title: string; lead: string } => {
  const m = basicSource(slug, lang).match(/^## (.+)\n\n(.+)$/m);
  return { title: m?.[1] ?? slug, lead: m?.[2] ?? '' };
};
