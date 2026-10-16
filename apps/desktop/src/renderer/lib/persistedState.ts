import { useCallback, useRef, useState, type SetStateAction } from "react";

function write<T>(key: string, value: T) {
	try {
		if (value === undefined) window.localStorage.removeItem(key);
		else window.localStorage.setItem(key, JSON.stringify(value));
	} catch { /* Keep the current session usable when browser storage is unavailable. */ }
}

export function usePersistedState<T>(key: string, initialValue: T) {
	const [value, setValue] = useState<T>(() => {
		try {
			const persisted = window.localStorage.getItem(key);
			return persisted ? (JSON.parse(persisted) as T) : initialValue;
		} catch {
			return initialValue;
		}
	});
	const latest = useRef(value);
	latest.current = value;

	// Persist immediately: a component that updates state and then unmounts in the
	// same tick (clearing a draft before navigating away) never renders the update.
	const setPersisted = useCallback((next: SetStateAction<T>) => {
		const resolved = typeof next === "function" ? (next as (value: T) => T)(latest.current) : next;
		latest.current = resolved;
		write(key, resolved);
		setValue(resolved);
	}, [key]);

	return [value, setPersisted] as const;
}
