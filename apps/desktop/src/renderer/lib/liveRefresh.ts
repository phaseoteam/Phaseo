// Foreground refresh follows the pinned T3 timing policy without polling hidden or idle views.
export function watchLiveRefresh(refresh: () => boolean, intervalMs: number): () => void {
 let lastRead = Date.now(), lastInteraction = lastRead;
 let timer: ReturnType<typeof setInterval> | undefined;
 const visible = () => document.visibilityState === "visible";
 const read = () => { const now = Date.now(); if (visible() && now - lastRead >= 10_000 && refresh()) lastRead = now; };
 const stop = () => { clearInterval(timer); timer = undefined; };
 const sync = () => { stop(); if (visible()) timer = setInterval(() => { if (Date.now() - lastInteraction >= 360_000) stop(); else read(); }, intervalMs); };
 const arrival = () => { lastInteraction = Date.now(); read(); sync(); };
 const interaction = () => { const idle = Date.now() - lastInteraction >= 360_000; lastInteraction = Date.now(); if (idle) { read(); sync(); } };
 sync(); window.addEventListener("focus", arrival); document.addEventListener("visibilitychange", arrival);
 for (const event of ["pointerdown", "pointermove", "keydown", "wheel"]) window.addEventListener(event, interaction, { passive: true });
 return () => { stop(); window.removeEventListener("focus", arrival); document.removeEventListener("visibilitychange", arrival); for (const event of ["pointerdown", "pointermove", "keydown", "wheel"]) window.removeEventListener(event, interaction); };
}
