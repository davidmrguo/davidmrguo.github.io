export const SITE_TITLE = "David Guo";
export const SITE_DESCRIPTION =
  "Random thoughts on data, business, and systems — with a touch of philosophy.";
export const AUTHOR = "David Guo";

// Headline block on the home page. Kept separate from SITE_DESCRIPTION,
// which is the site's meta description and RSS channel description.
export const HOME_TITLE = "Hello.";

/**
 * "Welcome" in English, Simplified Chinese and French — a nod to the
 * multilingual welcome video Mac OS X Snow Leopard (10.6) played on first
 * boot, trimmed to three languages.
 *
 * NOTE: the cycle timing in global.css is tuned to this list's length.
 * Adding or removing an entry means updating the keyframe percentages and
 * the multiplier on animation-duration.
 */
export const WELCOMES = [
  { text: "Welcome", lang: "en" },
  { text: "欢迎", lang: "zh-Hans" },
  { text: "Bienvenue", lang: "fr" },
] as const;

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
