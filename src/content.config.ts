import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "zod";

const posts = defineCollection({
  // Markdown and MDX files live in `src/content/posts/`. The filename (minus
  // extension) becomes the URL slug, so `hello-world.md` -> `/posts/hello-world/`.
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      // Drafts are visible in `astro dev` but excluded from production builds.
      draft: z.boolean().default(false),
      // Path relative to the markdown file, e.g. `./cover.jpg`.
      cover: image().optional(),
      coverAlt: z.string().default(""),
    }),
});

export const collections = { posts };
