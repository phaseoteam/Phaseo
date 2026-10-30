"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ActionDockCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const STORAGE_PREFIX = "phaseo-action-dock-v1";
const PREFERENCE_EVENT = "phaseo-action-dock-preference-change";
const enabledOverrides = new Map<string, boolean>();
const CORNERS: readonly ActionDockCorner[] = [
	"top-left",
	"top-right",
	"bottom-left",
	"bottom-right",
];

function storageKey(userId: string, preference: string) {
	return `${STORAGE_PREFIX}:${encodeURIComponent(userId)}:${preference}`;
}

export function readActionDockCorner(userId: string): ActionDockCorner {
	try {
		const value = window.localStorage.getItem(storageKey(userId, "corner"));
		return CORNERS.includes(value as ActionDockCorner)
			? (value as ActionDockCorner)
			: "bottom-right";
	} catch {
		return "bottom-right";
	}
}

export function saveActionDockCorner(userId: string, corner: ActionDockCorner) {
	try {
		window.localStorage.setItem(storageKey(userId, "corner"), corner);
	} catch {
		// The current position still applies for this page if browser storage is blocked.
	}
}

export function isActionDockDisabled(userId: string): boolean {
	const enabledOverride = enabledOverrides.get(userId);
	if (enabledOverride !== undefined) return !enabledOverride;
	try {
		return window.localStorage.getItem(storageKey(userId, "enabled")) === "false";
	} catch {
		return false;
	}
}

export function setActionDockEnabled(userId: string, enabled: boolean) {
	enabledOverrides.set(userId, enabled);
	try {
		window.localStorage.setItem(storageKey(userId, "enabled"), String(enabled));
	} catch {
		// Keep the change in memory for the current page if browser storage is blocked.
	}
	window.dispatchEvent(new CustomEvent(PREFERENCE_EVENT, { detail: { userId } }));
}

export function isActionDockHiddenForSession(userId: string): boolean {
	try {
		return window.sessionStorage.getItem(storageKey(userId, "hidden")) === "true";
	} catch {
		return false;
	}
}

export function hideActionDockForSession(userId: string) {
	try {
		window.sessionStorage.setItem(storageKey(userId, "hidden"), "true");
	} catch {
		// The current page can still hide the dock when session storage is blocked.
	}
}

export function useActionDockEnabled(userId?: string) {
	const subscribe = useCallback((onChange: () => void) => {
		if (!userId) return () => {};

		const syncPreference = (event: Event) => {
			if (
				event instanceof CustomEvent &&
				event.detail?.userId !== userId
			) {
				return;
			}
			if (event instanceof StorageEvent) {
				if (event.key !== null && event.key !== storageKey(userId, "enabled")) return;
				enabledOverrides.delete(userId);
			}
			onChange();
		};

		window.addEventListener(PREFERENCE_EVENT, syncPreference);
		window.addEventListener("storage", syncPreference);
		return () => {
			window.removeEventListener(PREFERENCE_EVENT, syncPreference);
			window.removeEventListener("storage", syncPreference);
		};
	}, [userId]);
	const getSnapshot = useCallback(
		() => !userId || !isActionDockDisabled(userId),
		[userId],
	);

	return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
