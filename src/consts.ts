export const SITE_TITLE = "David Guo";
export const SITE_DESCRIPTION =
  "Random thoughts on data, business, and systems — with a touch of philosophy.";
export const AUTHOR = "David Guo";

// Headline block on the home page. Kept separate from SITE_DESCRIPTION,
// which is the site's meta description and RSS channel description.
export const HOME_TITLE = "David’s GitHub Pages";
export const HOME_TAGLINE =
  "A small companion site to my blog — the pieces that don’t fit inside a post.";

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/posts/", label: "Posts" },
  { href: "/tags/", label: "Tags" },
  { href: "/about/", label: "About" },
] as const;

export const SOCIAL_LINKS = [
  { href: "https://medium.com/@davidmrguo", label: "Medium" },
  { href: "https://www.linkedin.com/in/davidmrguo/", label: "LinkedIn" },
  { href: "https://github.com/davidmrguo", label: "GitHub" },
] as const;
