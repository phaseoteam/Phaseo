import type { QueryClient } from "@tanstack/react-query";
import { clearAccountQueryCache } from "./invalidation";

/** Hide synchronously: a React state update can run after a restored frame paints. */
export function hideDocumentForSessionReset() {
	document.documentElement.style.setProperty("display", "none", "important");
}

/** A saved document must never restore private DOM from its previous session. */
export function listenForQueryHistory(
	queryClient: QueryClient,
	hide = hideDocumentForSessionReset,
	reload = () => window.location.reload(),
) {
	let departed = false;
	const discard = () => {
		hide();
		clearAccountQueryCache(queryClient);
	};
	const onPageHide = () => {
		// Scrub before BFCache freezes the document, not after it becomes visible.
		departed = true;
		discard();
	};
	const onPageShow = (event: PageTransitionEvent) => {
		if (!event.persisted && !departed) return;
		discard();
		// Do not unhide this document: server props and retained Next routes may
		// belong to another account. The new request rechecks authentication.
		reload();
	};
	window.addEventListener("pagehide", onPageHide);
	window.addEventListener("pageshow", onPageShow);
	return () => {
		window.removeEventListener("pagehide", onPageHide);
		window.removeEventListener("pageshow", onPageShow);
	};
}
