// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

import { remarkReadingTime } from "./plugins/remark-reading-time.mjs";

// https://astro.build/config
export default defineConfig({
  // Canonical origin. Used by the sitemap, the RSS feed and <link rel="canonical">.
  site: "https://davidmrguo.github.io",

  integrations: [mdx(), sitemap()],

  markdown: {
    // Astro 7 defaults to the Sätteri processor. We opt back into the
    // remark/rehype pipeline so the wider unified plugin ecosystem
    // (footnotes, TOC, math, callouts) stays available.
    processor: unified({
      remarkPlugins: [remarkReadingTime],
      rehypePlugins: [
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          {
            behavior: "append",
            properties: {
              class: "heading-anchor",
              ariaHidden: true,
              tabIndex: -1,
            },
            content: { type: "text", value: "#" },
          },
        ],
      ],
    }),

    shikiConfig: {
      // Two themes, switched with CSS variables so code blocks follow the
      // site theme rather than the OS setting alone. See `global.css`.
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
      wrap: false,
    },
  },

  build: {
    // Emit `/posts/hello/index.html` so URLs resolve without a trailing-slash
    // redirect on GitHub Pages.
    format: "directory",
  },
});
