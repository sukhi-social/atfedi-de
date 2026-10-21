# atfedi.de

A catalog of fediverse tools — sister site to
[joinfediverse.kr](https://joinfediverse.kr).

joinfediverse.kr is the doorway: *what is the fediverse, how do I start?*
atfedi.de is the next layer: *now, which software, which app, which tool?*

## The two lanes

Tools for **using** the fediverse and tools for **building** it barely
overlap, so the site keeps them on separate lanes rather than mixing them:

- `/[lang]/use` — clients, bridges, and other tools you use on the fediverse
- `/[lang]/build` — frameworks, relays, toolkits

Platforms themselves (Mastodon, Misskey, …) are intentionally out of scope —
choosing a platform to join is the sister site joinfediverse.kr's job.

The home page is a short intro plus the two doors.

## Stack

- **Astro 6** — static output, deploys to Cloudflare Pages with no adapter.
- **Svelte 5** — used for interactive islands (currently the category filter).
- Three languages: `en`, `ja`, `ko`. i18n is hand-rolled in `catalog/src/i18n/`.
  Copy is written per language — see `docs/writing.md`, with Korean-specific
  pitfalls in `docs/translation-ko.md`.
  Japanese line breaks are preprocessed with BudouX at build time; Korean
  uses `word-break: keep-all`. Long text renders through `components/Phrase.astro`.
- Fonts: Source Sans 3 for Latin; BIZ UDPGothic (ja) and Nanum Gothic (ko)
  appended per locale. CJK font files load only on their own language pages.

## Commands

```sh
corepack enable   # once; picks the pnpm version pinned in package.json
pnpm install
pnpm run dev      # local dev server
pnpm run build    # static build to dist/
pnpm run preview  # serve the build
pnpm run check    # type-check
```

## Adding a tool

Drop one YAML file into `catalog/src/content/tools/`. The schema lives in
`catalog/src/content.config.ts`. Name, links, and category are written once; only
`summary` is translated, and `ja` / `ko` are optional — a missing translation
falls back to English.

```yaml
name: Example
lane: use            # use | build
category: client     # client | bridge | discovery | service | utility
                     # framework | relay | toolkit
summary:
  en: One sentence in English.
  ja: 日本語の一文（任意）。
links:
  home: https://example.org
  repo: https://github.com/example/example   # optional
license: MIT          # optional
tags: [web]           # optional — e.g. web, iOS, Android, extension
discontinued: true    # optional — marks a service that has shut down
```

Any link (`home` / `repo` / `docs`) may instead be a set of per-locale URLs,
for a target site that has language-specific pages. The catalog then links to
the page matching the viewer's language, falling back to `en`:

```yaml
links:
  home:
    en: https://example.org/en/
    ja: https://example.org/ja/
    ko: https://example.org/ko/
```

## Shared styling — so the future app can reuse it

All visual styling lives in `catalog/src/styles/` as **plain, framework-agnostic CSS**:

- `tokens.css` — design tokens (colors, fonts, spacing) as CSS custom properties
- `base.css` — reset, element defaults, layout helpers
- `components.css` — component classes (`.tool-card`, `.chip`, `.lane-door`, …)

Component visuals are deliberately **not** placed in Astro scoped `<style>`
blocks or in Svelte `<style>` blocks. They are plain classes. That means:

- the Svelte island (`ToolFilter.svelte`) already reuses them, with no `<style>`
  block of its own;
- a future standalone Svelte / SvelteKit app can `import` these three CSS files
  unchanged and get the identical look.

When adding UI, keep this rule: put shared visuals in `catalog/src/styles/`, not inside
a single component.

## Structure

```
catalog/src/
  content.config.ts      tool collection schema
  content/tools/         one YAML file per tool
  i18n/                  ui strings + translation helpers
  styles/                framework-agnostic CSS (see above)
  layouts/Base.astro     html shell, header, footer, fonts
  components/            ToolCard.astro, ToolFilter.svelte
  pages/
    index.astro          root — redirects to the visitor's language
    [lang]/index.astro   home: intro + the two doors
    [lang]/[lane].astro  catalog for one lane (use | build)
```

## Credits

The blog's mark is the Teeline shorthand letter **b** — for *blog*, and a
nod to note-taking. The glyph comes from
[teeline-online](https://github.com/gonzo-engineering/teeline-online) by
Gonzo Engineering. Thank you for releasing it under the MIT License — that
openness is what let this catalog's blog wear a journalist's shorthand.

```
MIT License

Copyright (c) 2022 Gonzo Engineering

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
