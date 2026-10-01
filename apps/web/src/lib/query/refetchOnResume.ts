"use client";

import { useEffect, useRef } from "react";

const RESUME_REFETCH_INTERVAL_MS = 60 * 1_000;

/** Refetch long-lived catalogue views when a sleeping tab becomes active. */
export function useRefetchOnResume(
	refetch: () => Promise<unknown>,
	isStale: boolean,
	error?: unknown,
) {
	const lastRefetchedAtRef = useRef<number | null>(null);

	useEffect(() => {
		if (error) lastRefetchedAtRef.current = null;
	}, [error]);

	useEffect(() => {
		lastRefetchedAtRef.current ??= Date.now();

		const refetchIfStale = () => {
			if (!isStale || document.visibilityState === "hidden" || !navigator.onLine) return;
			const now = Date.now();
			if (
				lastRefetchedAtRef.current !== null &&
				now - lastRefetchedAtRef.current < RESUME_REFETCH_INTERVAL_MS
			) {
				return;
			}
			lastRefetchedAtRef.current = now;
			void refetch();
		};
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") refetchIfStale();
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("focus", refetchIfStale);
		window.addEventListener("pageshow", refetchIfStale);
		window.addEventListener("online", refetchIfStale);

		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("focus", refetchIfStale);
			window.removeEventListener("pageshow", refetchIfStale);
			window.removeEventListener("online", refetchIfStale);
		};
	}, [refetch, isStale]);
}
