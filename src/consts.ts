export const SITE_TITLE = "David Guo";
export const SITE_DESCRIPTION =
  "Random thoughts on data, business, and systems — with a touch of philosophy.";
export const AUTHOR = "David Guo";

// Headline block on the home page. Kept separate from SITE_DESCRIPTION,
// which is the site's meta description and RSS channel description.
export const HOME_TITLE = "Hello.";

/**
 * "Welcome" in each language Mac OS X Snow Leopard (10.6) shipped a
 * localization for — the greeting its first-boot welcome video used.
 *
 * Danish and Norwegian both write "Velkommen", so 17 locales yield 16
 * distinct words. The two Chinese scripts differ (欢迎 / 歡迎) and both
 * appear.
 *
 * NOTE: the cycle timing in global.css is tuned to this list's length.
 * Adding or removing an entry means updating the keyframe percentages.
 */
export const WELCOMES = [
  { text: "Welcome", lang: "en" },
  { text: "Willkommen", lang: "de" },
  { text: "Bienvenidos", lang: "es" },
  { text: "Bienvenue", lang: "fr" },
  { text: "Benvenuti", lang: "it" },
  { text: "Welkom", lang: "nl" },
  { text: "Velkommen", lang: "da" },
  { text: "Välkommen", lang: "sv" },
  { text: "Tervetuloa", lang: "fi" },
  { text: "Witamy", lang: "pl" },
  { text: "Bem-vindo", lang: "pt" },
  { text: "Добро пожаловать", lang: "ru" },
  { text: "ようこそ", lang: "ja" },
  { text: "欢迎", lang: "zh-Hans" },
  { text: "歡迎", lang: "zh-Hant" },
  { text: "환영합니다", lang: "ko" },
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
