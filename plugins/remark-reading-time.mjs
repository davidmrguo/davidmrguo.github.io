import getReadingTime from "reading-time";
import { toString } from "mdast-util-to-string";

/**
 * Adds `readingTime` (e.g. "4 min read") and `wordCount` to a page's
 * frontmatter, derived from the rendered markdown body.
 *
 * Content-collection pages read these off `remarkPluginFrontmatter`, which
 * `render()` returns alongside `<Content />`.
 */
export function remarkReadingTime() {
  return function (tree, { data }) {
    const textOnPage = toString(tree);
    const readingTime = getReadingTime(textOnPage);

    data.astro.frontmatter.readingTime = readingTime.text;
    data.astro.frontmatter.wordCount = readingTime.words;
  };
}
