import {
	defaultLocale,
	publicLocales,
	type PublicLocale,
} from "./locales";

export {
	catalogLocales,
	defaultLocale,
	getLocaleDefinition,
	isCatalogLocale,
	isPublicLocale,
	localeRegistry,
	previewLocales,
	publicLocales,
	translationLocales,
	variantLocales,
} from "./locales";
export type {
	CatalogLocale,
	FontProfile,
	LocaleDefinition,
	LocaleDirection,
	LocaleRelease,
	LocaleReviewState,
	LocaleRole,
	PreviewLocale,
	PublicLocale,
	RuntimeLocale,
	ShippedLocale,
	StagedLocale,
	TranslationLocale,
	VariantLocale,
} from "./locales";

if (publicLocales.length === 0) {
	throw new Error("At least one public locale is required");
}

const routableLocales = publicLocales as [
	PublicLocale,
	...PublicLocale[],
];

// next-intl defineRouting() only returned this config; web-start reads it directly.
export const routing = {
	locales: routableLocales,
	defaultLocale,
	localePrefix: "as-needed",
	localeDetection: true,
	localeCookie: {
		name: "PHASEO_LOCALE",
		maxAge: 60 * 60 * 24 * 365,
	},
} as const;
