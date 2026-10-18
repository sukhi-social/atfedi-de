import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { icons } from '../lib/icons';

// What the Worker needs from the build to render long-form pages from R2:
// the icons, and which tools have a guide (the guide's path on the site →
// its content folder, with the tool's name, lane and category for the
// kicker). Served at /catalog/site.json in the assets; not a public page.
export const GET: APIRoute = async () => {
  const guides = Object.fromEntries(
    (await getCollection('tools'))
      .filter((tool) => tool.data.page)
      .map((tool) => [
        tool.data.page,
        {
          content: `tool-pages/${tool.data.page!.split('/').pop()}`,
          name: tool.data.name,
          lane: tool.data.lane,
          category: tool.data.category,
        },
      ]),
  );
  return new Response(JSON.stringify({ icons, guides }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
