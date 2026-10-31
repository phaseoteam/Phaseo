import { publicLocales } from "./locales";

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
