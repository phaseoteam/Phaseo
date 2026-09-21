export const DISPLAY_LOCALES = ["system", "en-GB", "en-US"] as const;
export const DISPLAY_DATE_STYLES = ["short", "medium", "long", "iso"] as const;
export const DISPLAY_HOUR_CYCLES = ["system", "12h", "24h"] as const;
export const DISPLAY_RELATIVE_TIMES = ["contextual", "relative", "absolute"] as const;
export const DISPLAY_NUMBER_NOTATIONS = ["standard", "compact"] as const;
export const DISPLAY_LIGHT_PALETTES = ["phaseo", "paper", "warm"] as const;
export const DISPLAY_DARK_PALETTES = ["phaseo", "slate", "midnight"] as const;
export const DISPLAY_DENSITIES = ["comfortable", "compact"] as const;
export const DISPLAY_CODE_LANGUAGES = ["typescript", "python", "curl"] as const;
export const DISPLAY_LANDING_PAGES = ["home", "models", "chat", "monitor"] as const;

export type DisplayLocale = (typeof DISPLAY_LOCALES)[number];
export type DisplayDateStyle = (typeof DISPLAY_DATE_STYLES)[number];
export type DisplayHourCycle = (typeof DISPLAY_HOUR_CYCLES)[number];
export type DisplayRelativeTime = (typeof DISPLAY_RELATIVE_TIMES)[number];
export type DisplayNumberNotation = (typeof DISPLAY_NUMBER_NOTATIONS)[number];
export type DisplayLightPalette = (typeof DISPLAY_LIGHT_PALETTES)[number];
export type DisplayDarkPalette = (typeof DISPLAY_DARK_PALETTES)[number];
export type DisplayDensity = (typeof DISPLAY_DENSITIES)[number];
export type DisplayCodeLanguage = (typeof DISPLAY_CODE_LANGUAGES)[number];
export type DisplayLandingPage = (typeof DISPLAY_LANDING_PAGES)[number];

export type DisplayPreferences = {
	locale: DisplayLocale;
	dateStyle: DisplayDateStyle;
	timeZone: string;
	hourCycle: DisplayHourCycle;
	relativeTime: DisplayRelativeTime;
	numberNotation: DisplayNumberNotation;
	lightPalette: DisplayLightPalette;
	darkPalette: DisplayDarkPalette;
	lightAccent: string;
	darkAccent: string;
	density: DisplayDensity;
	codeLanguage: DisplayCodeLanguage;
	landingPage: DisplayLandingPage;
	maskSensitiveData: boolean;
};

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
	locale: "system",
	dateStyle: "medium",
	timeZone: "system",
	hourCycle: "system",
	relativeTime: "contextual",
	numberNotation: "standard",
	lightPalette: "phaseo",
	darkPalette: "phaseo",
	lightAccent: "#0069a8",
	darkAccent: "#0078b8",
	density: "comfortable",
	codeLanguage: "typescript",
	landingPage: "home",
	maskSensitiveData: false,
};

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
	return typeof value === "string" && values.includes(value as T);
}

export function isValidTimeZone(value: unknown): value is string {
	if (typeof value !== "string" || value.length > 100) return false;
	if (value === "system") return true;
	try {
		new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
		return true;
	} catch {
		return false;
	}
}

export function isValidAccentColor(value: unknown): value is string {
	return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function readableForegroundForAccent(value: string): "#ffffff" | "#0b0b0b" {
	const channels = [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
	const [red, green, blue] = channels.map((channel) =>
		channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
	);
	const luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
	const whiteContrast = 1.05 / (luminance + 0.05);
	const darkContrast = (luminance + 0.05) / 0.052;
	return whiteContrast >= darkContrast ? "#ffffff" : "#0b0b0b";
}

export function normalizeDisplayPreferences(value: unknown): DisplayPreferences {
	const candidate = value && typeof value === "object" && !Array.isArray(value)
		? value as Partial<Record<keyof DisplayPreferences, unknown>>
		: {};
	return {
		locale: isOneOf(candidate.locale, DISPLAY_LOCALES)
			? candidate.locale
			: DEFAULT_DISPLAY_PREFERENCES.locale,
		dateStyle: isOneOf(candidate.dateStyle, DISPLAY_DATE_STYLES)
			? candidate.dateStyle
			: DEFAULT_DISPLAY_PREFERENCES.dateStyle,
		timeZone: isValidTimeZone(candidate.timeZone)
			? candidate.timeZone
			: DEFAULT_DISPLAY_PREFERENCES.timeZone,
		hourCycle: isOneOf(candidate.hourCycle, DISPLAY_HOUR_CYCLES)
			? candidate.hourCycle
			: DEFAULT_DISPLAY_PREFERENCES.hourCycle,
		relativeTime: isOneOf(candidate.relativeTime, DISPLAY_RELATIVE_TIMES)
			? candidate.relativeTime
			: DEFAULT_DISPLAY_PREFERENCES.relativeTime,
		numberNotation: isOneOf(candidate.numberNotation, DISPLAY_NUMBER_NOTATIONS)
			? candidate.numberNotation
			: DEFAULT_DISPLAY_PREFERENCES.numberNotation,
		lightPalette: isOneOf(candidate.lightPalette, DISPLAY_LIGHT_PALETTES)
			? candidate.lightPalette
			: DEFAULT_DISPLAY_PREFERENCES.lightPalette,
		darkPalette: isOneOf(candidate.darkPalette, DISPLAY_DARK_PALETTES)
			? candidate.darkPalette
			: DEFAULT_DISPLAY_PREFERENCES.darkPalette,
		lightAccent: isValidAccentColor(candidate.lightAccent)
			? candidate.lightAccent.toLowerCase()
			: DEFAULT_DISPLAY_PREFERENCES.lightAccent,
		darkAccent: isValidAccentColor(candidate.darkAccent)
			? candidate.darkAccent.toLowerCase()
			: DEFAULT_DISPLAY_PREFERENCES.darkAccent,
		density: isOneOf(candidate.density, DISPLAY_DENSITIES)
			? candidate.density
			: DEFAULT_DISPLAY_PREFERENCES.density,
		codeLanguage: isOneOf(candidate.codeLanguage, DISPLAY_CODE_LANGUAGES)
			? candidate.codeLanguage
			: DEFAULT_DISPLAY_PREFERENCES.codeLanguage,
		landingPage: isOneOf(candidate.landingPage, DISPLAY_LANDING_PAGES)
			? candidate.landingPage
			: DEFAULT_DISPLAY_PREFERENCES.landingPage,
		maskSensitiveData: typeof candidate.maskSensitiveData === "boolean"
			? candidate.maskSensitiveData
			: DEFAULT_DISPLAY_PREFERENCES.maskSensitiveData,
	};
}

function localeFor(preferences: DisplayPreferences): string | undefined {
	return preferences.locale === "system" ? undefined : preferences.locale;
}

function timeZoneFor(preferences: DisplayPreferences): string | undefined {
	return preferences.timeZone === "system" ? undefined : preferences.timeZone;
}

function hour12For(preferences: DisplayPreferences): boolean | undefined {
	if (preferences.hourCycle === "12h") return true;
	if (preferences.hourCycle === "24h") return false;
	return undefined;
}

function parseDate(value: string | number | Date | null | undefined): Date | null {
	if (value == null || value === "") return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isFinite(date.getTime()) ? date : null;
}

export type DisplayDateValue = string | number | Date | null | undefined;

export function formatDisplayDateParts(
	value: DisplayDateValue,
	preferences: DisplayPreferences,
	options: Intl.DateTimeFormatOptions,
	fallback = "-",
): string {
	const date = parseDate(value);
	if (!date) return typeof value === "string" && value ? value : fallback;
	return new Intl.DateTimeFormat(localeFor(preferences), {
		...options,
		hour12: options.hour12 ?? hour12For(preferences),
		timeZone: options.timeZone ?? timeZoneFor(preferences),
	}).format(date);
}

function formatIsoDate(
	date: Date,
	preferences: DisplayPreferences,
	timeZone = timeZoneFor(preferences),
): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		timeZone,
	}).formatToParts(date);
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((candidate) => candidate.type === type)?.value ?? "";
	return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatDisplayDate(
	value: string | number | Date | null | undefined,
	preferences: DisplayPreferences,
	fallback = "-",
): string {
	const date = parseDate(value);
	if (!date) return typeof value === "string" && value ? value : fallback;
	if (preferences.dateStyle === "iso") return formatIsoDate(date, preferences);
	return new Intl.DateTimeFormat(localeFor(preferences), {
		dateStyle: preferences.dateStyle,
		timeZone: timeZoneFor(preferences),
	}).format(date);
}

export function formatDisplayCalendarDate(
	value: DisplayDateValue,
	preferences: DisplayPreferences,
	fallback = "-",
): string {
	const date = parseDate(value);
	if (!date) return typeof value === "string" && value ? value : fallback;
	if (preferences.dateStyle === "iso") return formatIsoDate(date, preferences, "UTC");
	return new Intl.DateTimeFormat(localeFor(preferences), {
		dateStyle: preferences.dateStyle,
		timeZone: "UTC",
	}).format(date);
}

export function formatDisplayTime(
	value: string | number | Date | null | undefined,
	preferences: DisplayPreferences,
	options?: { includeSeconds?: boolean },
): string {
	const date = parseDate(value);
	if (!date) return typeof value === "string" && value ? value : "-";
	return new Intl.DateTimeFormat(localeFor(preferences), {
		hour: "2-digit",
		minute: "2-digit",
		...(options?.includeSeconds ? { second: "2-digit" as const } : {}),
		hour12: hour12For(preferences),
		timeZone: timeZoneFor(preferences),
	}).format(date);
}

export function formatDisplayDateTime(
	value: string | number | Date | null | undefined,
	preferences: DisplayPreferences,
	options?: { includeSeconds?: boolean },
): string {
	const date = parseDate(value);
	if (!date) return typeof value === "string" && value ? value : "-";
	if (preferences.dateStyle === "iso") {
		return `${formatIsoDate(date, preferences)}, ${formatDisplayTime(date, preferences, options)}`;
	}
	return new Intl.DateTimeFormat(localeFor(preferences), {
		dateStyle: preferences.dateStyle,
		timeStyle: options?.includeSeconds ? "medium" : "short",
		hour12: hour12For(preferences),
		timeZone: timeZoneFor(preferences),
	}).format(date);
}

export function formatDisplayDateTimeRange(
	startValue: string | number | Date | null | undefined,
	endValue: string | number | Date | null | undefined,
	preferences: DisplayPreferences,
): string {
	const start = parseDate(startValue);
	const end = parseDate(endValue);
	if (!start || !end) return "-";
	const startDate = formatDisplayDate(start, preferences);
	const endDate = formatDisplayDate(end, preferences);
	if (startDate === endDate) {
		return `${startDate}, ${formatDisplayTime(start, preferences)} – ${formatDisplayTime(end, preferences)}`;
	}
	return `${formatDisplayDateTime(start, preferences)} – ${formatDisplayDateTime(end, preferences)}`;
}

function relativeUnit(milliseconds: number): { unit: Intl.RelativeTimeFormatUnit; value: number } {
	const absolute = Math.abs(milliseconds);
	if (absolute < 60_000) return { unit: "second", value: Math.round(milliseconds / 1_000) };
	if (absolute < 3_600_000) return { unit: "minute", value: Math.round(milliseconds / 60_000) };
	if (absolute < 86_400_000) return { unit: "hour", value: Math.round(milliseconds / 3_600_000) };
	if (absolute < 2_592_000_000) return { unit: "day", value: Math.round(milliseconds / 86_400_000) };
	if (absolute < 31_536_000_000) return { unit: "month", value: Math.round(milliseconds / 2_592_000_000) };
	return { unit: "year", value: Math.round(milliseconds / 31_536_000_000) };
}

export function formatDisplayTimestamp(
	value: string | number | Date | null | undefined,
	preferences: DisplayPreferences,
	referenceDate = new Date(),
): string {
	const date = parseDate(value);
	if (!date) return typeof value === "string" && value ? value : "-";
	const difference = date.getTime() - referenceDate.getTime();
	const useRelative = preferences.relativeTime === "relative" ||
		(preferences.relativeTime === "contextual" && Math.abs(difference) < 86_400_000);
	if (!useRelative) return formatDisplayDateTime(date, preferences);
	const { unit, value: relativeValue } = relativeUnit(difference);
	return new Intl.RelativeTimeFormat(localeFor(preferences), { numeric: "auto" })
		.format(relativeValue, unit);
}

export function formatDisplayNumber(
	value: number,
	preferences: DisplayPreferences,
	options?: Intl.NumberFormatOptions,
): string {
	const notation = options?.notation ?? preferences.numberNotation;
	return new Intl.NumberFormat(localeFor(preferences), {
		...options,
		notation,
		...(notation === "compact" ? { compactDisplay: "short" as const } : {}),
	}).format(value);
}
