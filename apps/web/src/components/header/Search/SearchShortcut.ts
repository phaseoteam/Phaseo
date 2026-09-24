"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
	return () => {};
}

function getIsMacPlatform() {
	if (typeof navigator === "undefined") return false;
	return /Mac|iPhone|iPad|iPod/i.test(`${navigator.platform} ${navigator.userAgent}`);
}

function getServerSnapshot() {
	return false;
}

export function useSearchShortcutLabel() {
	const isMacPlatform = useSyncExternalStore(subscribe, getIsMacPlatform, getServerSnapshot);
	return isMacPlatform ? "⌘ K" : "Ctrl K";
}
