import { defineRouting } from "next-intl/routing";
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

export const routing = defineRouting({
	locales: routableLocales,
	defaultLocale,
	localePrefix: "as-needed",
	localeDetection: true,
	localeCookie: {
		name: "PHASEO_LOCALE",
		maxAge: 60 * 60 * 24 * 365,
	},
});
