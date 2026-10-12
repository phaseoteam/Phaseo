import { useEffect, useState } from "react";

export function usePersistedState<T>(key: string, initialValue: T) {
	const [value, setValue] = useState<T>(() => {
		try {
			const persisted = window.localStorage.getItem(key);
			return persisted ? (JSON.parse(persisted) as T) : initialValue;
		} catch {
			return initialValue;
		}
	});

	useEffect(() => {
		try {
			if (value === undefined) window.localStorage.removeItem(key);
			else window.localStorage.setItem(key, JSON.stringify(value));
		} catch { /* Keep the current session usable when browser storage is unavailable. */ }
	}, [key, value]);

	return [value, setValue] as const;
}
