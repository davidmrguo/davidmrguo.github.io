---
title: "Hello, world"
description: "A new site, built on markdown files and a static build step."
pubDate: 2026-08-18
tags: ["meta", "astro"]
---

This site is a pile of markdown files and a build step. That's the whole idea.

Every post lives at `src/content/posts/<slug>.md`. The filename becomes the URL,
the frontmatter becomes the metadata, and the body becomes the page. Push to
`main` and GitHub Actions rebuilds the site.

## Adding a post

Create a file, fill in the frontmatter, write:

```markdown
---
title: "The title"
description: "One or two sentences. Used in listings, meta tags, and the feed."
pubDate: 2026-08-18
tags: ["writing"]
---

The body starts here.
```

Only `title`, `description`, and `pubDate` are required. The build fails loudly
if any of them are missing or malformed — a typo'd date is caught before it
ships, not after.

## What you get for free

- A canonical URL, Open Graph tags, and Twitter card metadata on every page.
- An RSS feed at `/rss.xml` and a sitemap at `/sitemap-index.xml`.
- Reading time, computed from the rendered body at build time.
- Tag pages, generated from whatever tags the posts happen to use.
- Syntax highlighting that follows the light/dark toggle.

Nothing here needs configuring. Write the file and it shows up.
