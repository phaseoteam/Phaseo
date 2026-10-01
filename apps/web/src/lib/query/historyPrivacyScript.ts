/**
 * A history navigation may replay cached HTML without restoring its JS heap.
 * Run in <head>, before private server-rendered markup can paint or hydrate.
 * Do not defer this through next/script: even beforeInteractive is queued.
 * This is static source only; never interpolate account data into it.
 */
export const HISTORY_PRIVACY_SCRIPT = `(() => {
  const navigation = performance.getEntriesByType("navigation")[0];
  if (navigation && navigation.type === "back_forward") {
    document.documentElement.style.setProperty("display", "none", "important");
    window.location.reload();
  }
})();`;
