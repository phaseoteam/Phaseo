"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const MIN_AWAY_MS = 60 * 1_000;

export default function RefreshModelPageOnResume() {
	const router = useRouter();

	useEffect(() => {
		let awaySince: number | null = document.visibilityState === "hidden" ? Date.now() : null;

		function markAway() {
			awaySince ??= Date.now();
		}

		function refreshAfterAway() {
			if (document.visibilityState === "hidden") return;
			const elapsed = awaySince === null ? 0 : Date.now() - awaySince;
			awaySince = null;
			if (elapsed >= MIN_AWAY_MS) router.refresh();
		}

		function onVisibilityChange() {
			if (document.visibilityState === "hidden") markAway();
			else refreshAfterAway();
		}

		document.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener("blur", markAway);
		window.addEventListener("focus", refreshAfterAway);
		window.addEventListener("pageshow", refreshAfterAway);
		return () => {
			document.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("blur", markAway);
			window.removeEventListener("focus", refreshAfterAway);
			window.removeEventListener("pageshow", refreshAfterAway);
		};
	}, [router]);

	return null;
}
