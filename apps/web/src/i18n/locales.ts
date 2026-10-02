export type LocaleRole = "source" | "full" | "overlay" | "pseudo";
export type LocaleRelease = "public" | "staged" | "preview";
export type LocaleReviewState =
	| "source"
	| "machine-draft"
	| "approved"
	| "generated";
export type LocaleDirection = "ltr" | "rtl";
export type FontProfile =
	| "latin"
	| "han-simplified"
	| "devanagari"
	| "japanese"
	| "arabic";

export type LocaleDefinition = {
	role: LocaleRole;
	release: LocaleRelease;
	reviewState: LocaleReviewState;
	fallback: string | null;
	nativeName: string;
	englishName: string;
	script: string;
	dir: LocaleDirection;
	font: FontProfile;
};

export const localeRegistry = {
	"en-GB": {
		role: "source",
		release: "public",
		reviewState: "source",
		fallback: null,
		nativeName: "English (UK)",
		englishName: "English (United Kingdom)",
		script: "Latn",
		dir: "ltr",
		font: "latin",
	},
	"en-US": {
		role: "overlay",
		release: "public",
		reviewState: "approved",
		fallback: "en-GB",
		nativeName: "English (US)",
		englishName: "English (United States)",
		script: "Latn",
		dir: "ltr",
		font: "latin",
	},
	"zh-Hans": {
		role: "full",
		release: "public",
		reviewState: "approved",
		fallback: null,
		nativeName: "简体中文",
		englishName: "Chinese (Simplified)",
		script: "Hans",
		dir: "ltr",
		font: "han-simplified",
	},
	hi: {
		role: "full",
		release: "public",
		reviewState: "approved",
		fallback: null,
		nativeName: "हिन्दी",
		englishName: "Hindi",
		script: "Deva",
		dir: "ltr",
		font: "devanagari",
	},
	"es-ES": {
		role: "full",
		release: "public",
		reviewState: "approved",
		fallback: null,
		nativeName: "Español (España)",
		englishName: "Spanish (Spain)",
		script: "Latn",
		dir: "ltr",
		font: "latin",
	},
	"fr-FR": {
		role: "full",
		release: "public",
		reviewState: "approved",
		fallback: null,
		nativeName: "Français (France)",
		englishName: "French (France)",
		script: "Latn",
		dir: "ltr",
		font: "latin",
	},
	"de-DE": {
		role: "full",
		release: "public",
		reviewState: "approved",
		fallback: null,
		nativeName: "Deutsch (Deutschland)",
		englishName: "German (Germany)",
		script: "Latn",
		dir: "ltr",
		font: "latin",
	},
	"pt-BR": {
		role: "full",
		release: "public",
		reviewState: "approved",
		fallback: null,
		nativeName: "Português (Brasil)",
		englishName: "Portuguese (Brazil)",
		script: "Latn",
		dir: "ltr",
		font: "latin",
	},
	ja: {
		role: "full",
		release: "public",
		reviewState: "approved",
		fallback: null,
		nativeName: "日本語",
		englishName: "Japanese",
		script: "Jpan",
		dir: "ltr",
		font: "japanese",
	},
	"ar-SA": {
		role: "full",
		release: "public",
		reviewState: "approved",
		fallback: null,
		nativeName: "العربية",
		englishName: "Arabic",
		script: "Arab",
		dir: "rtl",
		font: "arabic",
	},
	"en-XA": {
		role: "pseudo",
		release: "preview",
		reviewState: "generated",
		fallback: "en-GB",
		nativeName: "Pseudo-English",
		englishName: "English (Pseudo)",
		script: "Latn",
		dir: "ltr",
		font: "latin",
	},
} as const satisfies Record<string, LocaleDefinition>;

type LocaleRegistry = typeof localeRegistry;
export type CatalogLocale = keyof LocaleRegistry;
export type PublicLocale = {
	[Locale in CatalogLocale]: LocaleRegistry[Locale]["release"] extends "public"
		? Locale
		: never;
}[CatalogLocale];
export type TranslationLocale = {
	[Locale in CatalogLocale]: LocaleRegistry[Locale]["role"] extends "full"
		? Locale
		: never;
}[CatalogLocale];
export type VariantLocale = {
	[Locale in CatalogLocale]: LocaleRegistry[Locale]["role"] extends "overlay"
		? Locale
		: never;
}[CatalogLocale];
export type PreviewLocale = {
	[Locale in CatalogLocale]: LocaleRegistry[Locale]["role"] extends "pseudo"
		? Locale
		: never;
}[CatalogLocale];
export type RuntimeLocale = CatalogLocale;

export const defaultLocale = "en-GB" as const satisfies PublicLocale;
export const catalogLocales = Object.keys(localeRegistry) as CatalogLocale[];
export const publicLocales = catalogLocales.filter(
	(locale): locale is PublicLocale => localeRegistry[locale].release === "public",
);
export const translationLocales = catalogLocales.filter(
	(locale): locale is TranslationLocale => localeRegistry[locale].role === "full",
);
export const variantLocales = catalogLocales.filter(
	(locale): locale is VariantLocale => localeRegistry[locale].role === "overlay",
);
export const previewLocales = catalogLocales.filter(
	(locale): locale is PreviewLocale => localeRegistry[locale].role === "pseudo",
);

export function getLocaleDefinition(locale: CatalogLocale): LocaleDefinition {
	return localeRegistry[locale];
}

export function isCatalogLocale(
	value: string | null | undefined,
): value is CatalogLocale {
	return typeof value === "string" && Object.hasOwn(localeRegistry, value);
}

export function isPublicLocale(
	value: string | null | undefined,
): value is PublicLocale {
	return isCatalogLocale(value) && localeRegistry[value].release === "public";
}
