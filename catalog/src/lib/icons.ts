// The Lucide icons the pages use (src/assets/lucide/*.svg), as a name → svg
// map for lib/tool-page. Bundled at build time; also published as
// /icons.json so the Worker can render pages from R2 with the same icons.
import type { IconMap } from './tool-page';

const files = import.meta.glob('../assets/lucide/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const icons: IconMap = Object.fromEntries(
  Object.entries(files).map(([path, svg]) => [
    path.replace(/.*\/([a-z0-9-]+)\.svg$/, '$1'),
    svg
      .replace(/<!--[\s\S]*?-->\s*/g, '') // lucide-static license comment
      .replace(' class="lucide', ' data-lucide="')
      .replace('<svg', '<svg class="i" aria-hidden="true"')
      .trim(),
  ]),
);
