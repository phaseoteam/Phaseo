import englishUsAuthOverrides from "../../messages/en-US/auth.overrides.json";
import simplifiedChineseAuthMessages from "../../messages/zh-Hans/auth.json";
import hindiAuthMessages from "../../messages/hi/auth.json";
import spanishAuthMessages from "../../messages/es-ES/auth.json";
import frenchAuthMessages from "../../messages/fr-FR/auth.json";
import germanAuthMessages from "../../messages/de-DE/auth.json";
import brazilianPortugueseAuthMessages from "../../messages/pt-BR/auth.json";
import japaneseAuthMessages from "../../messages/ja/auth.json";
import arabicAuthMessages from "../../messages/ar-SA/auth.json";
import {
	englishAuthMessages,
	type AuthMessages,
	type SourceAuthMessages,
} from "./default-messages";
import {
	mergeMessages,
	type AuthMessageOverlay,
} from "./message-overlays";
import { pseudoLocalizeMessages } from "./pseudo";
import type { CatalogLocale, VariantLocale } from "./routing";

export type { AuthMessageOverlay, MessageOverlay } from "./message-overlays";

type OverlayCatalog = {
	fallback: CatalogLocale;
	messages: AuthMessageOverlay;
};

const overlayCatalogs: Record<VariantLocale, OverlayCatalog> = {
	"en-US": {
		fallback: "en-GB",
		messages: englishUsAuthOverrides,
	},
};

const catalogMessages: Record<CatalogLocale, AuthMessages> = {
	"en-GB": englishAuthMessages,
	"en-US": mergeMessages(
		englishAuthMessages,
		overlayCatalogs["en-US"].messages,
	),
	"zh-Hans": simplifiedChineseAuthMessages,
	hi: hindiAuthMessages,
	"es-ES": spanishAuthMessages,
	"fr-FR": frenchAuthMessages,
	"de-DE": germanAuthMessages,
	"pt-BR": brazilianPortugueseAuthMessages,
	ja: japaneseAuthMessages,
	"ar-SA": arabicAuthMessages,
	"en-XA": pseudoLocalizeMessages(englishAuthMessages),
};

export function getCatalogMessages(locale: CatalogLocale): AuthMessages {
	return catalogMessages[locale];
}

export function getTypedCatalogMessages(
	locale: CatalogLocale,
): SourceAuthMessages {
	// The source literals preserve next-intl's ICU argument inference. Catalog
	// validation proves runtime values have the same key and argument contract.
	return catalogMessages[locale] as SourceAuthMessages;
}

export function getCatalogOverlay(locale: VariantLocale): AuthMessageOverlay {
	return overlayCatalogs[locale].messages;
}

export function getCatalogOverlayFallback(
	locale: VariantLocale,
): CatalogLocale {
	return overlayCatalogs[locale].fallback;
}
