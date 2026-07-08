# davidmrguo.github.io

A minimal [Nuxt 3](https://nuxt.com) "coming soon" landing page, styled with
Tailwind CSS, deployed to GitHub Pages via GitHub Actions. Its only job right
now is to show a waitlist CTA that opens a modal hosting a Mailchimp signup
form.

## Project structure

- [`app.vue`](app.vue) — root component, just renders the current page.
- [`pages/index.vue`](pages/index.vue) — the one and only page (`/`). Hero
  section (product name, tagline, description placeholders) plus the "Join
  the Waitlist" CTA. The Mailchimp `<head>` snippet is wired in here via
  `useHead()`.
- [`components/WaitlistModal.vue`](components/WaitlistModal.vue) — the
  waitlist modal dialog (title, blurb, Mailchimp form placeholder, Close
  button). Closes on outside click or Escape.
- [`stores/ui.ts`](stores/ui.ts) — Pinia store holding the modal's
  open/closed state.
- [`assets/css/tailwind.css`](assets/css/tailwind.css) — Tailwind's
  `@tailwind` directives; loaded globally via `nuxt.config.ts`.
- [`tailwind.config.ts`](tailwind.config.ts) — Tailwind content globs.
- [`nuxt.config.ts`](nuxt.config.ts) — configures static generation
  (`nitro.preset: "github_pages"`) and registers the `@nuxtjs/tailwindcss`
  and `@pinia/nuxt` modules.
- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) — builds the
  site with `npm run generate` and deploys `.output/public` to GitHub Pages
  on every push to `main`.

## Adding/updating the Mailchimp form

1. **Head code** — in [`pages/index.vue`](pages/index.vue), inside the
   `useHead({ script: [...] })` call at the top of the `<script setup>`
   block. The connected-site tracking script is already there; add any other
   Mailchimp `<head>` snippets as additional entries in that array.
2. **Form markup** — in
   [`components/WaitlistModal.vue`](components/WaitlistModal.vue), replace
   the `<!-- MAILCHIMP FORM (BODY) CODE GOES HERE -->` comment with the
   `<form>` HTML Mailchimp gives you (from Audience → Signup forms →
   Embedded forms).

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
