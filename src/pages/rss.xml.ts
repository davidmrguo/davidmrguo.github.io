import rss from "@astrojs/rss";
import type { APIContext } from "astro";

import { getPublishedPosts } from "../lib/posts";
import { SITE_TITLE, SITE_DESCRIPTION } from "../consts";

export async function GET(context: APIContext) {
  const posts = await getPublishedPosts();

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // `context.site` comes from the `site` option in astro.config.mjs.
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/posts/${post.id}/`,
      categories: post.data.tags,
    })),
    customData: "<language>en-us</language>",
  });
}
