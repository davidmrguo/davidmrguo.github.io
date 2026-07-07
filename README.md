# davidmrguo.github.io

A minimal [Nuxt 3](https://nuxt.com) static site, deployed to GitHub Pages via
GitHub Actions. Its only job right now is to host a Mailchimp signup form.

## Project structure

- [`app.vue`](app.vue) — root component, just renders the current page.
- [`pages/index.vue`](pages/index.vue) — the one and only page (`/`). Contains
  the site title, intro text, and the Mailchimp form section. The Mailchimp
  `<head>` snippet is wired in here via `useHead()`.
- [`nuxt.config.ts`](nuxt.config.ts) — configures static generation
  (`nitro.preset: "github_pages"`).
- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) — builds the
  site with `npm run generate` and deploys `.output/public` to GitHub Pages
  on every push to `main`.

## Adding/updating the Mailchimp form

Open [`pages/index.vue`](pages/index.vue):

1. **Head code** — inside the `useHead({ script: [...] })` call at the top of
   the `<script setup>` block. The connected-site tracking script is already
   there; add any other Mailchimp `<head>` snippets as additional entries in
   that array.
2. **Form markup** — inside the `<section aria-label="Newsletter signup">`
   block in the `<template>`. Paste the `<form>` HTML Mailchimp gives you
   (from Audience → Signup forms → Embedded forms) in place of the comment.

## Local development

```bash
npm install
npm run dev       # http://localhost:3000
```

## Build & preview the static output locally

```bash
npm run generate  # outputs to .output/public
npm run preview
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which generates
the static site and publishes it to GitHub Pages.

One-time repo setup (if not already done): in **Settings → Pages**, set
**Source** to **GitHub Actions**.
