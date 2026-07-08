// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",

  modules: ["@nuxtjs/tailwindcss", "@pinia/nuxt"],

  css: ["~/assets/css/tailwind.css"],

  // Static site generation for GitHub Pages.
  ssr: true,
  nitro: {
    preset: "github_pages",
  },

  app: {
    // This repo is a user/organization GitHub Pages site (davidmrguo.github.io),
    // so it's served from the domain root. If you ever move this to a
    // project page (username.github.io/repo-name), set this to '/repo-name/'.
    baseURL: "/",
  },

  devtools: { enabled: false },
});
