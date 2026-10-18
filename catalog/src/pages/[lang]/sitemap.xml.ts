import type { APIRoute } from 'astro';
import { locales } from '../../i18n/ui';
import { basicSlugs } from '../../lib/basics';

// One sitemap per locale — the Worker serves /{lang}/sitemap.xml as
// {lang}.atfedi.de/sitemap.xml, so each lists only its own host's pages.
export function getStaticPaths() {
  return locales.map((lang) => ({ params: { lang } }));
}

const pages = [
  '/',
  '/use/',
  '/build/',
  '/build/fedify/',
  '/build/fedify/roadmap/',
  '/build/fedify/feels-good/',
  '/build/fedify/watch-out/',
  '/build/fedify/running/',
  ...basicSlugs.map((slug) => `/basics/${slug}/`),
];

export const GET: APIRoute = ({ params }) => {
  const urls = pages
    .map((p) => `  <url><loc>https://${params.lang}.atfedi.de${p}</loc></url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
