"use client";

import HEYO from "@heyo.so/js";

export function openHeyo() {
	if (typeof window === "undefined") return;
	// Initialize HEYO without auto-opening
	if (!HEYO.ready) {
		HEYO.onReady(() => {
			// HEYO is ready, but we don't auto-open it
		});
	}
}
