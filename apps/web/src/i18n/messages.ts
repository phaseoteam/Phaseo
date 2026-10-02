import "server-only";

import {
	englishAuthMessages,
	englishSiteMessages,
	englishCatalogueMessages,
	englishCommonMessages,
	englishContentMessages,
	englishProductMessages,
	englishSettingsUiMessages,
	type SourceMessages,
	type AuthMessages,
} from "./default-messages";
import { mergeCatalogMessages, mergeMessages, nestDottedMessageKeys } from "./message-overlays";
import type { PublicLocale } from "./routing";

type PublicMessageLoader = () => Promise<AuthMessages>;
type MessageTree = Record<string, unknown>;
type DomainMessageLoader = () => Promise<MessageTree>;

const commonMessageLoaders: Record<PublicLocale, DomainMessageLoader> = {
	"en-GB": async () => englishCommonMessages,
	"en-US": async () => mergeCatalogMessages(englishCommonMessages, (await import("../../messages/en-US/common.overrides.json")).default),
	"zh-Hans": async () => (await import("../../messages/zh-Hans/common.json")).default,
	hi: async () => (await import("../../messages/hi/common.json")).default,
	"es-ES": async () => (await import("../../messages/es-ES/common.json")).default,
	"fr-FR": async () => (await import("../../messages/fr-FR/common.json")).default,
	"de-DE": async () => (await import("../../messages/de-DE/common.json")).default,
	"pt-BR": async () => (await import("../../messages/pt-BR/common.json")).default,
	ja: async () => (await import("../../messages/ja/common.json")).default,
	"ar-SA": async () => (await import("../../messages/ar-SA/common.json")).default,
};

const siteMessageLoaders: Record<PublicLocale, DomainMessageLoader> = {
	"en-GB": async () => englishSiteMessages,
	"en-US": async () => mergeCatalogMessages(englishSiteMessages, (await import("../../messages/en-US/site.overrides.json")).default),
	"zh-Hans": async () => (await import("../../messages/zh-Hans/site.json")).default,
	hi: async () => (await import("../../messages/hi/site.json")).default,
	"es-ES": async () => (await import("../../messages/es-ES/site.json")).default,
	"fr-FR": async () => (await import("../../messages/fr-FR/site.json")).default,
	"de-DE": async () => (await import("../../messages/de-DE/site.json")).default,
	"pt-BR": async () => (await import("../../messages/pt-BR/site.json")).default,
	ja: async () => (await import("../../messages/ja/site.json")).default,
	"ar-SA": async () => (await import("../../messages/ar-SA/site.json")).default,
};

const catalogueMessageLoaders: Record<PublicLocale, DomainMessageLoader> = {
	"en-GB": async () => englishCatalogueMessages,
	"en-US": async () => mergeCatalogMessages(englishCatalogueMessages, (await import("../../messages/en-US/catalogue.overrides.json")).default),
	"zh-Hans": async () => (await import("../../messages/zh-Hans/catalogue.json")).default,
	hi: async () => (await import("../../messages/hi/catalogue.json")).default,
	"es-ES": async () => (await import("../../messages/es-ES/catalogue.json")).default,
	"fr-FR": async () => (await import("../../messages/fr-FR/catalogue.json")).default,
	"de-DE": async () => (await import("../../messages/de-DE/catalogue.json")).default,
	"pt-BR": async () => (await import("../../messages/pt-BR/catalogue.json")).default,
	ja: async () => (await import("../../messages/ja/catalogue.json")).default,
	"ar-SA": async () => (await import("../../messages/ar-SA/catalogue.json")).default,
};

const contentMessageLoaders: Record<PublicLocale, DomainMessageLoader> = {
	"en-GB": async () => englishContentMessages,
	"en-US": async () => mergeCatalogMessages(englishContentMessages, (await import("../../messages/en-US/content.overrides.json")).default),
	"zh-Hans": async () => (await import("../../messages/zh-Hans/content.json")).default,
	hi: async () => (await import("../../messages/hi/content.json")).default,
	"es-ES": async () => (await import("../../messages/es-ES/content.json")).default,
	"fr-FR": async () => (await import("../../messages/fr-FR/content.json")).default,
	"de-DE": async () => (await import("../../messages/de-DE/content.json")).default,
	"pt-BR": async () => (await import("../../messages/pt-BR/content.json")).default,
	ja: async () => (await import("../../messages/ja/content.json")).default,
	"ar-SA": async () => (await import("../../messages/ar-SA/content.json")).default,
};

const productMessageLoaders: Record<PublicLocale, DomainMessageLoader> = {
	"en-GB": async () => englishProductMessages,
	"en-US": async () => mergeCatalogMessages(englishProductMessages, (await import("../../messages/en-US/product.overrides.json")).default),
	"zh-Hans": async () => (await import("../../messages/zh-Hans/product.json")).default,
	hi: async () => (await import("../../messages/hi/product.json")).default,
	"es-ES": async () => (await import("../../messages/es-ES/product.json")).default,
	"fr-FR": async () => (await import("../../messages/fr-FR/product.json")).default,
	"de-DE": async () => (await import("../../messages/de-DE/product.json")).default,
	"pt-BR": async () => (await import("../../messages/pt-BR/product.json")).default,
	ja: async () => (await import("../../messages/ja/product.json")).default,
	"ar-SA": async () => (await import("../../messages/ar-SA/product.json")).default,
};

const settingsUiMessageLoaders: Record<PublicLocale, DomainMessageLoader> = {
	"en-GB": async () => englishSettingsUiMessages,
	"en-US": async () => mergeCatalogMessages(englishSettingsUiMessages, (await import("../../messages/en-US/settings-ui.overrides.json")).default),
	"zh-Hans": async () => (await import("../../messages/zh-Hans/settings-ui.json")).default,
	hi: async () => (await import("../../messages/hi/settings-ui.json")).default,
	"es-ES": async () => (await import("../../messages/es-ES/settings-ui.json")).default,
	"fr-FR": async () => (await import("../../messages/fr-FR/settings-ui.json")).default,
	"de-DE": async () => (await import("../../messages/de-DE/settings-ui.json")).default,
	"pt-BR": async () => (await import("../../messages/pt-BR/settings-ui.json")).default,
	ja: async () => (await import("../../messages/ja/settings-ui.json")).default,
	"ar-SA": async () => (await import("../../messages/ar-SA/settings-ui.json")).default,
};

const publicMessageLoaders: Record<PublicLocale, PublicMessageLoader> = {
	"en-GB": async () => englishAuthMessages,
	"en-US": async () => mergeMessages(englishAuthMessages, (await import("../../messages/en-US/auth.overrides.json")).default),
	"zh-Hans": async () => (await import("../../messages/zh-Hans/auth.json")).default,
	hi: async () => (await import("../../messages/hi/auth.json")).default,
	"es-ES": async () => (await import("../../messages/es-ES/auth.json")).default,
	"fr-FR": async () => (await import("../../messages/fr-FR/auth.json")).default,
	"de-DE": async () => (await import("../../messages/de-DE/auth.json")).default,
	"pt-BR": async () => (await import("../../messages/pt-BR/auth.json")).default,
	ja: async () => (await import("../../messages/ja/auth.json")).default,
	"ar-SA": async () => (await import("../../messages/ar-SA/auth.json")).default,
};

export async function getPublicMessages(locale: PublicLocale): Promise<SourceMessages> {
	const [messages, common, site, catalogue, content, product, settingsUI] = await Promise.all([
		publicMessageLoaders[locale](), commonMessageLoaders[locale](), siteMessageLoaders[locale](),
		catalogueMessageLoaders[locale](), contentMessageLoaders[locale](), productMessageLoaders[locale](), settingsUiMessageLoaders[locale](),
	]);
	return { ...messages, Common: common, Site: site, Catalogue: catalogue, Content: content, Product: product, SettingsUI: nestDottedMessageKeys(settingsUI) } as SourceMessages;
}
