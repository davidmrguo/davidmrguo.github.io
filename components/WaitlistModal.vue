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

          <div class="mt-6">
            <!-- ----------------------------------------------------------- -->
            <!-- MAILCHIMP FORM (BODY) CODE GOES HERE                        -->
            <!-- ----------------------------------------------------------- -->
            <!-- Paste the Mailchimp embedded form HTML (the <form> markup   -->
            <!-- and any surrounding wrapper divs) below, replacing this     -->
            <!-- comment.                                                   -->
            <!--                                                             -->
            <!-- <form action="..." method="post" ...> ... </form>           -->
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
