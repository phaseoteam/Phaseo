/**
 * Apple App Store Connect metadata localizations, checked 2026-08-30.
 *
 * @see https://developer.apple.com/help/app-store-connect/reference/app-information/app-store-localizations
 */
export const appleAppStoreLocales = [
	"ar-SA",
	"bn-BD",
	"ca",
	"zh-Hans",
	"zh-Hant",
	"hr",
	"cs",
	"da",
	"nl-NL",
	"en-AU",
	"en-CA",
	"en-GB",
	"en-US",
	"fi",
	"fr-FR",
	"fr-CA",
	"de-DE",
	"el",
	"gu-IN",
	"he",
	"hi",
	"hu",
	"id",
	"it",
	"ja",
	"kn-IN",
	"ko",
	"ms",
	"ml-IN",
	"mr-IN",
	"no",
	"or-IN",
	"pl",
	"pt-BR",
	"pt-PT",
	"pa-IN",
	"ro",
	"ru",
	"sk",
	"sl-SI",
	"es-MX",
	"es-ES",
	"sv",
	"ta-IN",
	"te-IN",
	"th",
	"tr",
	"uk",
	"ur-PK",
	"vi",
] as const;

export type AppleAppStoreLocale = (typeof appleAppStoreLocales)[number];

export function isAppleAppStoreLocale(
	value: string | null | undefined,
): value is AppleAppStoreLocale {
	return appleAppStoreLocales.some((locale) => locale === value);
}
