<script setup lang="ts">
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
  <main>
    <h1>David Guo</h1>
    <p>
      This is a minimal landing page. Sign up below to get updates.
    </p>

    <section aria-label="Newsletter signup">
      <!-- ------------------------------------------------------------- -->
      <!-- MAILCHIMP FORM (BODY) CODE GOES HERE                          -->
      <!-- ------------------------------------------------------------- -->
      <!-- Paste the Mailchimp embedded form HTML (the <form> markup and -->
      <!-- any surrounding wrapper divs) below, replacing this comment.  -->
      <!--                                                               -->
      <!-- <form action="..." method="post" ...> ... </form>             -->
    </section>
  </main>
</template>
