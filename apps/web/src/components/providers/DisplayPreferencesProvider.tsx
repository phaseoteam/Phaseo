"use client";

import * as React from "react";

import {
	DEFAULT_DISPLAY_PREFERENCES,
	formatDisplayCalendarDate,
	formatDisplayDate,
	formatDisplayDateParts,
	formatDisplayDateTime,
	formatDisplayDateTimeRange,
	formatDisplayNumber,
	formatDisplayTime,
	formatDisplayTimestamp,
	normalizeDisplayPreferences,
	readableForegroundForAccent,
	type DisplayDateValue,
	type DisplayPreferences,
} from "@/lib/displayPreferences";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import type { SettingsPreferencesInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { fetchAccountWebApi } from "@/lib/web-api/client";

const STORAGE_KEY = "phaseo-display-preferences-v1";

type DisplayPreferencesContextValue = {
	isHydrated: boolean;
	preferences: DisplayPreferences;
	setPreferences: (preferences: DisplayPreferences) => void;
};

const DisplayPreferencesContext = React.createContext<DisplayPreferencesContextValue | null>(null);

export function DisplayPreferencesProvider({ children }: { children: React.ReactNode }) {
	const [preferences, setPreferencesState] = React.useState<DisplayPreferences>(
		DEFAULT_DISPLAY_PREFERENCES,
	);
	const [isHydrated, setIsHydrated] = React.useState(false);
	const localMutationVersion = React.useRef(0);

	React.useEffect(() => {
		let cancelled = false;
		const timer = window.setTimeout(() => {
			try {
				const stored = window.localStorage.getItem(STORAGE_KEY);
				if (stored) setPreferencesState(normalizeDisplayPreferences(JSON.parse(stored)));
			} catch {
				// A malformed value or blocked storage API falls back to the defaults.
			} finally {
				setIsHydrated(true);
			}

			const requestMutationVersion = localMutationVersion.current;
			void (async () => {
				try {
					const accessToken = await getBrowserAccessToken();
					const data = await fetchAccountWebApi<SettingsPreferencesInitialData>(
						"/api/account/settings/preferences",
						accessToken,
					);
					if (
						cancelled ||
						!data.signedIn ||
						requestMutationVersion !== localMutationVersion.current
					) return;

					const accountPreferences = normalizeDisplayPreferences(data.preferences);
					setPreferencesState(accountPreferences);
					try {
						window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accountPreferences));
					} catch {
						// Account preferences still apply for this session when storage is blocked.
					}
				} catch {
					// Keep the locally cached preferences when auth or the account API is unavailable.
				}
			})();
		}, 0);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, []);

	const setPreferences = React.useCallback((next: DisplayPreferences) => {
		localMutationVersion.current += 1;
		const normalized = normalizeDisplayPreferences(next);
		setPreferencesState((current) => {
			if (JSON.stringify(current) === JSON.stringify(normalized)) return current;
			return normalized;
		});
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
		} catch {
			// A blocked storage API should not prevent preferences applying for this session.
		}
	}, []);

	const value = React.useMemo(
		() => ({ isHydrated, preferences, setPreferences }),
		[isHydrated, preferences, setPreferences],
	);

	React.useEffect(() => {
		const root = document.documentElement;
		root.dataset.lightPalette = preferences.lightPalette;
		root.dataset.darkPalette = preferences.darkPalette;
		root.style.setProperty("--light-user-accent", preferences.lightAccent);
		root.style.setProperty(
			"--light-user-accent-foreground",
			readableForegroundForAccent(preferences.lightAccent),
		);
		root.style.setProperty("--dark-user-accent", preferences.darkAccent);
		root.style.setProperty(
			"--dark-user-accent-foreground",
			readableForegroundForAccent(preferences.darkAccent),
		);
	}, [preferences]);

	return (
		<DisplayPreferencesContext.Provider value={value}>
			{children}
		</DisplayPreferencesContext.Provider>
	);
}

export function useDisplayPreferences() {
	const context = React.useContext(DisplayPreferencesContext);
	if (!context) {
		throw new Error("useDisplayPreferences must be used within DisplayPreferencesProvider");
	}
	return context;
}

export function useDisplayFormatters() {
	const { preferences } = useDisplayPreferences();

	return React.useMemo(() => ({
		calendarDate: (value: DisplayDateValue, fallback?: string) =>
			formatDisplayCalendarDate(value, preferences, fallback),
		date: (value: DisplayDateValue, fallback?: string) =>
			formatDisplayDate(value, preferences, fallback),
		dateParts: (
			value: DisplayDateValue,
			options: Intl.DateTimeFormatOptions,
			fallback?: string,
		) => formatDisplayDateParts(value, preferences, options, fallback),
		dateTime: (
			value: DisplayDateValue,
			options?: { includeSeconds?: boolean },
		) => formatDisplayDateTime(value, preferences, options),
		dateTimeRange: (start: DisplayDateValue, end: DisplayDateValue) =>
			formatDisplayDateTimeRange(start, end, preferences),
		number: (value: number, options?: Intl.NumberFormatOptions) =>
			formatDisplayNumber(value, preferences, options),
		time: (
			value: DisplayDateValue,
			options?: { includeSeconds?: boolean },
		) => formatDisplayTime(value, preferences, options),
		timestamp: (value: DisplayDateValue, referenceDate?: Date) =>
			formatDisplayTimestamp(value, preferences, referenceDate),
	}), [preferences]);
}
