"use client";

import { useEffect, useRef } from "react";
import type { KeyedMutator } from "swr";

// Keep resume checks aligned with the public models catalogue cache TTL.
const RESUME_REVALIDATION_INTERVAL_MS = 30 * 60 * 1_000;

/**
 * Revalidate after a long-lived tab becomes active again.
 *
 * Browsers can freeze a background tab without reliably delivering the same
 * focus lifecycle events that SWR normally listens for. The explicit
 * visibility, focus, and pageshow listeners cover the resume paths used by
 * sleeping, restored, and discarded tabs without polling while hidden.
 */
export function useRevalidateOnResume<T>(mutate: KeyedMutator<T>) {
	const lastRevalidatedAtRef = useRef<number | null>(null);

	useEffect(() => {
		lastRevalidatedAtRef.current ??= Date.now();

		const revalidateIfStale = () => {
			if (document.visibilityState === "hidden") return;

			const now = Date.now();
			if (
				now - (lastRevalidatedAtRef.current ?? now) <
				RESUME_REVALIDATION_INTERVAL_MS
			) {
				return;
			}

			lastRevalidatedAtRef.current = now;
			void mutate();
		};
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") revalidateIfStale();
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("focus", revalidateIfStale);
		window.addEventListener("pageshow", revalidateIfStale);

		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("focus", revalidateIfStale);
			window.removeEventListener("pageshow", revalidateIfStale);
		};
	}, [mutate]);
}
