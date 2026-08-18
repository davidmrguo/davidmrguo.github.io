---
title: "Markdown reference"
description: "Every element this site styles, in one page — useful for checking the theme after a CSS change."
pubDate: 2026-08-17
updatedDate: 2026-08-18
tags: ["meta", "reference"]
---

A kitchen-sink page. Load it after touching `global.css` to see what broke.

## Text

Body copy is set in a serif face at a comfortable measure. You can go **bold**,
*italic*, ***both***, ~~struck through~~, `inline code`, or
[a link](https://astro.build).

> A blockquote, for when someone else said it better.
>
> It can run to several paragraphs.

## Lists

- An unordered item
- Another one
  - Nested one level
  - And a sibling
- Back to the top level

1. Ordered items
2. Count up
3. As expected

## Code

Fenced blocks are highlighted by Shiki with matched light and dark themes:

```ts
interface Post {
  title: string;
  pubDate: Date;
  tags: string[];
}

const byDate = (a: Post, b: Post) => b.pubDate.valueOf() - a.pubDate.valueOf();

export const recent = (posts: Post[], n = 5) => [...posts].sort(byDate).slice(0, n);
```

```bash
npm run dev
```

## Tables

| Frontmatter   | Type       | Required |
| ------------- | ---------- | -------- |
| `title`       | string     | yes      |
| `description` | string     | yes      |
| `pubDate`     | date       | yes      |
| `updatedDate` | date       | no       |
| `tags`        | string[]   | no       |
| `draft`       | boolean    | no       |

## Headings nest

### Third level

Each heading gets an `id` and a hover anchor, so any section is linkable.

#### Fourth level

Below this, headings render as body text — if you need a fifth level, the piece
probably wants splitting.

---

That horizontal rule is the last element worth checking.
