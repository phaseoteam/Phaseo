const DOCS_BASE_URL = "https://phaseo.app/docs";

const DOCS_LOCALE_BY_WEB_LOCALE: Readonly<Record<string, string>> = {
	"en-GB": "en",
	"en-US": "en",
	"en-XA": "en",
	"es-ES": "es",
	"fr-FR": "fr",
	"de-DE": "de",
	"pt-BR": "pt-BR",
	hi: "hi",
	ja: "ja",
	"zh-Hans": "zh-Hans",
	"ar-SA": "ar",
};

export function getLocalizedDocsHref(locale: string, path: string): string {
	const docsLocale = DOCS_LOCALE_BY_WEB_LOCALE[locale] ?? "en";
	const docsPath = path.startsWith(DOCS_BASE_URL)
		? path.slice(DOCS_BASE_URL.length)
		: path;
	const normalizedPath = docsPath.replace(/^\/+/, "");
	const localePrefix = docsLocale === "en" ? "" : `${docsLocale}/`;

	return `${DOCS_BASE_URL}/${localePrefix}${normalizedPath}`;
}
