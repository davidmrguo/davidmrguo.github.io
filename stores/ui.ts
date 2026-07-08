import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", {
  state: () => ({
    isWaitlistModalOpen: false,
  }),
  actions: {
    openWaitlistModal() {
      this.isWaitlistModalOpen = true;
    },
    closeWaitlistModal() {
      this.isWaitlistModalOpen = false;
    },
  },
});
