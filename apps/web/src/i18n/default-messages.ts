import englishAuthMessages from "../../messages/en-GB/auth.json";
import englishCommonMessages from "../../messages/en-GB/common.json";
import englishSiteMessages from "../../messages/en-GB/site.json";
import englishCatalogueMessages from "../../messages/en-GB/catalogue.json";
import englishContentMessages from "../../messages/en-GB/content.json";
import englishProductMessages from "../../messages/en-GB/product.json";
import englishSettingsUiMessages from "../../messages/en-GB/settings-ui.json";

export { englishAuthMessages };
export type SourceAuthMessages = typeof englishAuthMessages;
export type WidenMessages<T> = T extends string
	? string
	: T extends Record<string, unknown>
		? { [Key in keyof T]: WidenMessages<T[Key]> }
		: never;
export type AuthMessages = WidenMessages<SourceAuthMessages>;

/** The source catalog used by the shared site chrome. */
export { englishCommonMessages };
export type SourceCommonMessages = typeof englishCommonMessages;
export type CommonMessages = WidenMessages<SourceCommonMessages>;

/** The source catalog used by the public marketing and trust pages. */
export { englishSiteMessages };
export type SourceSiteMessages = typeof englishSiteMessages;
export type SiteMessages = WidenMessages<SourceSiteMessages>;

/** Source catalog for model, provider, benchmark, ranking, and monitor surfaces. */
export { englishCatalogueMessages };
export type SourceCatalogueMessages = typeof englishCatalogueMessages;
export type CatalogueMessages = WidenMessages<SourceCatalogueMessages>;

/** Source catalog for public editorial and support content. */
export { englishContentMessages };
export type SourceContentMessages = typeof englishContentMessages;
export type ContentMessages = WidenMessages<SourceContentMessages>;

/** Source catalog for interactive product, playground, tool, and experiment surfaces. */
export { englishProductMessages };
export type SourceProductMessages = typeof englishProductMessages;
export type ProductMessages = WidenMessages<SourceProductMessages>;

/** Source catalog for the signed-in settings UI's shared static copy. */
export { englishSettingsUiMessages };
export type SourceSettingsUiMessages = typeof englishSettingsUiMessages;
export type SettingsUiMessages = WidenMessages<SourceSettingsUiMessages>;

/** The complete source message tree supplied to NextIntlClientProvider. */
export const englishMessages = {
	...englishAuthMessages,
	Common: englishCommonMessages,
	Site: englishSiteMessages,
	Catalogue: englishCatalogueMessages,
	Content: englishContentMessages,
	Product: englishProductMessages,
	SettingsUI: englishSettingsUiMessages,
} as const;
export type SourceMessages = typeof englishMessages;
