import { useCallback, useSyncExternalStore } from "react";

// Lesson progress lives only in this browser. No sign-in, nothing on the server.
const STORAGE_KEY = "phaseo-learn:done:v1";
const listeners = new Set<() => void>();
const EMPTY: ReadonlySet<string> = new Set();
let cached: { raw: string | null; value: ReadonlySet<string> } = { raw: null, value: EMPTY };

function readRaw(): string | null {
	try {
		return window.localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

function snapshot(): ReadonlySet<string> {
	const raw = readRaw();
	if (raw === cached.raw) return cached.value;
	let value: ReadonlySet<string> = EMPTY;
	try {
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		if (Array.isArray(parsed)) value = new Set(parsed.filter((item): item is string => typeof item === "string"));
	} catch {
		value = EMPTY;
	}
	cached = { raw, value };
	return value;
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	const onStorage = (event: StorageEvent) => {
		if (event.key === STORAGE_KEY) listener();
	};
	window.addEventListener("storage", onStorage);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", onStorage);
	};
}

function write(next: ReadonlySet<string>) {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
	} catch {
		// Storage can be blocked (private mode); progress just won't persist.
		cached = { raw: cached.raw, value: next };
	}
	for (const listener of listeners) listener();
}

/** Completed lesson refs ("course/lesson") for this browser. Empty during server rendering. */
export function useLearnProgress() {
	const done = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
	const setDone = useCallback((ref: string, value: boolean) => {
		const next = new Set(snapshot());
		if (value) next.add(ref);
		else next.delete(ref);
		write(next);
	}, []);
	return { done, setDone };
}
