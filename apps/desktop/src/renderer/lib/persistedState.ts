import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

function write<T>(key: string, value: T) {
	try {
		if (value === undefined) window.localStorage.removeItem(key);
		else window.localStorage.setItem(key, JSON.stringify(value));
	} catch { /* Keep the current session usable when browser storage is unavailable. */ }
}

/** Every mounted state for a key, so a write from anywhere (another component, an agent's settings.set) shows in all of them. */
const subscribers = new Map<string, Set<(value: unknown) => void>>();

export function readPersistedValue<T>(key: string, fallback: T): T {
	try { const persisted = window.localStorage.getItem(key); return persisted ? (JSON.parse(persisted) as T) : fallback; } catch { return fallback; }
}
export function writePersistedValue<T>(key: string, value: T) {
	write(key, value);
	for (const subscriber of subscribers.get(key) ?? []) subscriber(value);
}

export function usePersistedState<T>(key: string, initialValue: T) {
	const [value, setValue] = useState<T>(() => readPersistedValue(key, initialValue));
	const latest = useRef(value);
	latest.current = value;
	useEffect(() => {
		const subscriber = (next: unknown) => { latest.current = next as T; setValue(next as T); };
		const set = subscribers.get(key) ?? new Set(); set.add(subscriber); subscribers.set(key, set);
		return () => { set.delete(subscriber); };
	}, [key]);

	// Persist immediately: a component that updates state and then unmounts in the
	// same tick (clearing a draft before navigating away) never renders the update.
	const setPersisted = useCallback((next: SetStateAction<T>) => {
		const resolved = typeof next === "function" ? (next as (value: T) => T)(latest.current) : next;
		latest.current = resolved;
		// Its own update too: a child's effect can call this before this component's subscription is in place.
		setValue(resolved);
		writePersistedValue(key, resolved);
	}, [key]);

	return [value, setPersisted] as const;
}
