---
title: "A post in progress"
description: "Drafts render in the dev server and are stripped from production builds."
pubDate: 2026-08-18
tags: ["meta"]
draft: true
---

Setting `draft: true` keeps a post out of production builds, the RSS feed, the
sitemap, and every listing — but `astro dev` still renders it, so you can read
it in place while you work.

Delete the flag to publish it.
