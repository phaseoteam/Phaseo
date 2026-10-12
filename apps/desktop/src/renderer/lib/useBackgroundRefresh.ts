import { useEffect, useRef } from "react";

export const BACKGROUND_REFRESH_MS = 10 * 60 * 1000;

export function watchBackgroundRefresh(refresh: () => void) {
	const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, BACKGROUND_REFRESH_MS);
	return () => clearInterval(timer);
}

export function useBackgroundRefresh(refresh: () => void) {
	const latest = useRef(refresh);
	useEffect(() => { latest.current = refresh; });
	useEffect(() => watchBackgroundRefresh(() => latest.current()), []);
}
