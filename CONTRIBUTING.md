# Contributing

Thanks for helping out — whether you're adding a tool, fixing a typo, or
writing a blog post. This page covers two small things that are easy to trip
over: how to name your branch, and how to preview a blog post before it ships.

For the bigger picture (the project layout, running it locally), see the
[README](README.md).

## Adding a tool

A tool is one YAML file dropped into:

```
catalog/src/content/tools/{name}.yaml
```

The schema lives next to it, in `catalog/src/content.config.ts`, and the
[README](README.md#adding-a-tool) walks through every field with an example.
The short version: name, links, and category are written once; only `summary`
is translated, and the `ja` / `ko` translations are optional — a missing one
falls back to English.

## Naming your branch

**Please don't create branches that start with `pr-`.**

Here's why. The live preview URL looks like this:

```
blog.atfedi.de/v/preview/{ref}/-/{lang}/{slug}
```

When `{ref}` is something like `pr-123`, the preview reads it as
"pull request #123" and shows that PR. So as long as no *branch* is ever named
`pr-123`, there's never any confusion about whether `pr-123` means a branch or
a PR — it always means the PR.

Anything other than a `pr-` prefix is fine. Slashes are welcome too
(`feature/new-card`, say) — the URL uses `/-/` to separate the ref from the
content path, so a slash in your branch name won't break anything.

## Previewing a blog post

Posts live in the atfedi-content repository, at:

```
content/posts/{slug}.{lang}.md
```

The `{ref}` below is a branch (or PR) of that repository.

Once your branch is pushed — or once your PR is open — you can see the post
rendered before it's built into the site. Two URL shapes work:

```
https://blog.atfedi.de/v/preview/{branch}/-/{lang}/{slug}
https://blog.atfedi.de/v/preview/pr-{number}/-/{lang}/{slug}
```

A couple of things to keep in mind:

- The preview is meant to be *close to* production, not pixel-identical to the
  final Astro build. Treat it as a good-enough look, not the last word.
- Every preview page is `noindex`, so search engines won't pick it up.

The full path from draft to production — branch, preview, merge, and the
clean-worktree deploy — is written up (in Japanese) in
[docs/publishing.md](docs/publishing.md).
