"use client";

import { useSyncExternalStore } from "react";

// A shared minute clock for limit reset countdowns. It is null during server render and
// hydration, so callers fall back to the server's observation time and markup matches.
let limitClockNow: number | null = null;
function subscribeLimitClock(onChange: () => void) {
	const id = window.setInterval(() => {
		limitClockNow = Date.now();
		onChange();
	}, 60_000);
	return () => window.clearInterval(id);
}
const getLimitClockNow = () => (limitClockNow ??= Date.now());
const getServerLimitClockNow = () => null;

export function useLimitClock(): number | null {
	return useSyncExternalStore(subscribeLimitClock, getLimitClockNow, getServerLimitClockNow);
}
