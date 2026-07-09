<script setup lang="ts">
import { useUiStore } from "~/stores/ui";

const ui = useUiStore();

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    ui.closeWaitlistModal();
  }
}

watch(
  () => ui.isWaitlistModalOpen,
  (isOpen) => {
    if (isOpen) {
      document.addEventListener("keydown", onKeydown);
    } else {
      document.removeEventListener("keydown", onKeydown);
    }
  },
);

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition ease-out duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="ui.isWaitlistModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        @click.self="ui.closeWaitlistModal()"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="waitlist-modal-title"
          class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8"
        >
          <div class="flex items-start justify-between gap-4">
            <h2
              id="waitlist-modal-title"
              class="text-xl font-semibold tracking-tight text-slate-900"
            >
              Join the Waitlist
            </h2>
            <button
              type="button"
              aria-label="Close"
              class="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              @click="ui.closeWaitlistModal()"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="h-5 w-5"
              >
                <path
                  d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
                />
              </svg>
            </button>
          </div>

          <p class="mt-3 text-sm leading-relaxed text-slate-600">
            Sign up to receive updates and get early access when we launch.
          </p>

          <div id="mc_embed_shell" class="mt-6">
            <div id="mc_embed_signup">
              <form
                action="https://gmail.us1.list-manage.com/subscribe/post?u=1783fc998d0f50a680094e36b&amp;id=bddd5b7d7d&amp;f_id=007e74e1f0"
                method="post"
                id="mc-embedded-subscribe-form"
                name="mc-embedded-subscribe-form"
                class="validate"
                target="_self"
                novalidate
              >
                <div id="mc_embed_signup_scroll" class="space-y-4">
                  <p class="text-xs text-slate-500">
                    <span class="text-red-500">*</span> indicates required
                  </p>

                  <div>
                    <label
                      for="mce-EMAIL"
                      class="block text-sm font-medium text-slate-700"
                      >Email Address <span class="text-red-500">*</span></label
                    >
                    <input
                      type="email"
                      name="EMAIL"
                      id="mce-EMAIL"
                      required
                      class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                  </div>

                  <div>
                    <label
                      for="mce-FNAME"
                      class="block text-sm font-medium text-slate-700"
                      >First Name <span class="text-red-500">*</span></label
                    >
                    <input
                      type="text"
                      name="FNAME"
                      id="mce-FNAME"
                      required
                      class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                  </div>

                  <div>
                    <label
                      for="mce-LNAME"
                      class="block text-sm font-medium text-slate-700"
                      >Last Name <span class="text-red-500">*</span></label
                    >
                    <input
                      type="text"
                      name="LNAME"
                      id="mce-LNAME"
                      required
                      class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                  </div>

                  <div>
                    <label
                      for="mce-COMPANY"
                      class="block text-sm font-medium text-slate-700"
                      >Company <span class="text-red-500">*</span></label
                    >
                    <input
                      type="text"
                      name="COMPANY"
                      id="mce-COMPANY"
                      required
                      class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                  </div>

                  <div>
                    <label
                      for="mce-MMERGE7"
                      class="block text-sm font-medium text-slate-700"
                      >Job Title <span class="text-red-500">*</span></label
                    >
                    <input
                      type="text"
                      name="MMERGE7"
                      id="mce-MMERGE7"
                      required
                      class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                  </div>

                  <div id="mce-responses" class="clear">
                    <div
                      class="response text-sm text-red-600"
                      id="mce-error-response"
                      style="display: none"
                    ></div>
                    <div
                      class="response text-sm text-green-600"
                      id="mce-success-response"
                      style="display: none"
                    ></div>
                  </div>

                  <!-- Honeypot field — required by Mailchimp to deter bots, must stay offscreen. -->
                  <div aria-hidden="true" class="absolute left-[-5000px]">
                    <input
                      type="text"
                      name="b_1783fc998d0f50a680094e36b_bddd5b7d7d"
                      tabindex="-1"
                    />
                  </div>

                  <div>
                    <input
                      type="submit"
                      name="subscribe"
                      id="mc-embedded-subscribe"
                      value="Sign Up"
                      class="w-full cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
                    />
                  </div>
                </div>
              </form>
            </div>
          </div>

          <button
            type="button"
            class="mt-6 w-full rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            @click="ui.closeWaitlistModal()"
          >
            Close
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
