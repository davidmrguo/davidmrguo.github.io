<script setup lang="ts">
import { useUiStore } from "~/stores/ui";

const ui = useUiStore();

// ---------------------------------------------------------------------------
// MAILCHIMP <HEAD> CODE GOES HERE
// ---------------------------------------------------------------------------
// Paste any additional Mailchimp <head> snippets Mailchimp gives you inside
// the `script` array below (as another object), or replace the `innerHTML`
// of the existing entry. This one is the "connected site" tracking script.
useHead({
  script: [
    {
      id: "mcjs",
      innerHTML: `!function(c,h,i,m,p){m=c.createElement(h),p=c.getElementsByTagName(h)[0],m.async=1,m.src=i,p.parentNode.insertBefore(m,p)}(document,"script","https://chimpstatic.com/mcjs-connected/js/users/1783fc998d0f50a680094e36b/f882325dbfe4d0bd202e7bbe0.js");`,
    },
    // <-- Paste additional Mailchimp <head> snippets here, if any -->
  ],
});
</script>

<template>
  <main
    class="flex min-h-screen flex-col items-center justify-center px-6 py-24 text-center"
  >
    <section class="mx-auto flex max-w-xl flex-col items-center gap-6">
      <!-- Product name (placeholder) -->
      <h1 class="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        Product Name
      </h1>

      <!-- Tagline (placeholder) -->
      <p class="text-lg font-medium text-slate-500">
        A short tagline about what this product does.
      </p>

      <!-- Description (placeholder) -->
      <p class="text-base leading-relaxed text-slate-500">
        We're building something new and it's not quite ready yet. Leave
        your email and we'll let you know the moment it's available.
      </p>

      <button
        type="button"
        class="mt-2 rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
        @click="ui.openWaitlistModal()"
      >
        Join the Waitlist
      </button>
    </section>

    <WaitlistModal />
  </main>
</template>
