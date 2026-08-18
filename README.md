# davidmrguo.github.io

A static content site built with [Astro](https://astro.build). Posts are
markdown files; pushing to `main` rebuilds and redeploys to GitHub Pages.

## Writing a post

Create a file in `src/content/posts/`. The filename becomes the URL, so
`why-static.md` is served at `/posts/why-static/`.

```markdown
---
title: "Why static"
description: "One or two sentences. Used in listings, meta tags, and the RSS feed."
pubDate: 2026-08-18
tags: ["writing", "web"]
---

The body starts here.
```

### Frontmatter

| Field         | Type       | Required | Notes                                          |
| ------------- | ---------- | -------- | ---------------------------------------------- |
| `title`       | string     | yes      |                                                |
| `description` | string     | yes      | Listings, `<meta name="description">`, RSS      |
| `pubDate`     | date       | yes      | `YYYY-MM-DD`. Drives ordering                   |
| `updatedDate` | date       | no       | Shown under the title when present              |
| `tags`        | string[]   | no       | Tag pages are generated from these              |
| `draft`       | boolean    | no       | Visible in `dev`, stripped from production      |
| `cover`       | image path | no       | Relative to the file, e.g. `./cover.jpg`        |
| `coverAlt`    | string     | no       | Alt text for the cover                          |

The schema lives in [`src/content.config.ts`](src/content.config.ts) and is
enforced at build time — a missing field or a malformed date fails the build
rather than shipping broken.

`.mdx` files work too, if a post needs components. Cover images referenced in
frontmatter are optimized and served as responsive `srcset`s.

Standalone pages (not posts) go in `src/pages/` as `.md` with
`layout: ../layouts/PageLayout.astro` — see [`src/pages/about.md`](src/pages/about.md).

## Local development

Once, after cloning:

```bash
npm install
```

Then, to write:

```bash
npm run dev
```

That serves the site at <http://localhost:4321> with hot reload — edits to a
markdown file show up without a restart. **Drafts are visible here**, which is
the main thing separating it from the preview below.

### Previewing the real site

`npm run dev` runs a development server, not the site you actually ship. To see
exactly what GitHub Pages will serve — drafts stripped, assets hashed, RSS and
sitemap generated — build first, then preview the output:

```bash
npm run build && npm run preview
```

That also serves on <http://localhost:4321>. Reach for it before merging
anything that touches layout, metadata or the feed, since those are the things
that behave differently between a dev server and a static build.

The preview server runs **in the background** and keeps running after the
command returns, so it needs stopping explicitly:

```bash
npx astro preview stop
```

`npx astro preview status` reports whether one is running, and
`npx astro preview logs` shows its output.

Note that `npm run build` writes into `dist/`, which is gitignored — nothing
about previewing locally ends up in a commit.

### All commands

| Command           | Does                                                     |
| ----------------- | -------------------------------------------------------- |
| `npm run dev`     | Dev server with hot reload, drafts included               |
| `npm run build`   | Static build into `dist/`, drafts stripped                |
| `npm run preview` | Serve the built `dist/` in the background                 |
| `npm run check`   | Type-check `.astro` and `.ts` files                       |
| `npm run sync`    | Regenerate content-collection types after a schema change |

## Project structure

```
src/
├── content/posts/       # the posts — markdown and MDX
├── content.config.ts    # frontmatter schema
├── consts.ts            # site title, home hero, nav and social links
├── lib/posts.ts         # post querying: draft filtering, sorting, tags
├── layouts/
│   ├── BaseLayout.astro # <html> shell: head, header, footer
│   └── PageLayout.astro # for standalone markdown pages
├── components/          # BaseHead, Header, Footer, PostCard, FormattedDate
├── pages/
│   ├── index.astro      # home, 5 most recent posts
│   ├── posts/           # archive + [...slug] post pages
│   ├── tags/            # tag index + [tag] pages
│   ├── about.md         # a markdown page
│   ├── rss.xml.ts       # the feed
│   └── 404.astro
└── styles/global.css    # the entire design system
plugins/                 # remark plugin: reading time
public/                  # favicon, robots.txt — copied verbatim
```

## What's generated

- `/rss.xml` and `/sitemap-index.xml`
- Canonical URLs, Open Graph and Twitter card tags on every page
- Reading time, computed from the body at build time
- Tag pages, from whatever tags posts actually use
- Heading IDs and hover anchors, so any section is linkable

## Customizing

- **Site name, home headline, the welcome cycle, nav and social links** —
  [`src/consts.ts`](src/consts.ts). Note that `SITE_DESCRIPTION` is the meta
  description and RSS channel description, not the visible home tagline.
- **Colors, type, spacing** — the custom properties at the top of
  [`src/styles/global.css`](src/styles/global.css). Light values sit on `:root`;
  dark overrides follow. There is no kitchen-sink page to check a change
  against — the scaffold post that served that purpose was deleted once real
  posts existed. Add a post with `draft: true` if you want one back; it renders
  in `npm run dev` and never reaches production.
- **Domain** — the `site` field in [`astro.config.mjs`](astro.config.mjs) and the
  URL in [`public/robots.txt`](public/robots.txt). For a custom domain, add a
  `public/CNAME`.

### A note on the markdown pipeline

Astro 7 defaults to Sätteri, its native markdown processor. This site opts back
into the remark/rehype pipeline via `unified()` in
[`astro.config.mjs`](astro.config.mjs), which keeps the unified plugin ecosystem
(footnotes, TOC, math, callouts) available at the cost of somewhat slower builds.
To switch, install `@astrojs/markdown-satteri` and drop `markdown.processor` — but
the reading-time and heading-anchor plugins would need Sätteri equivalents.

## Deployment

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds the site and publishes `dist/` to GitHub Pages.

One-time repo setup: **Settings → Pages → Source → GitHub Actions**.
