import englishSettingsMessages from "../../messages/en-GB/settings.json";
import englishSettingsUiMessages from "../../messages/en-GB/settings-ui.json";
import zhHansSettingsMessages from "../../messages/zh-Hans/settings.json";
import hiSettingsMessages from "../../messages/hi/settings.json";
import esSettingsMessages from "../../messages/es-ES/settings.json";
import frSettingsMessages from "../../messages/fr-FR/settings.json";
import germanSettingsMessages from "../../messages/de-DE/settings.json";
import ptSettingsMessages from "../../messages/pt-BR/settings.json";
import jaSettingsMessages from "../../messages/ja/settings.json";
import arSettingsMessages from "../../messages/ar-SA/settings.json";
import enUsSettingsOverlay from "../../messages/en-US/settings.overrides.json";
import enUsSettingsUiOverlay from "../../messages/en-US/settings-ui.overrides.json";
import zhHansSettingsUiMessages from "../../messages/zh-Hans/settings-ui.json";
import hiSettingsUiMessages from "../../messages/hi/settings-ui.json";
import esSettingsUiMessages from "../../messages/es-ES/settings-ui.json";
import frSettingsUiMessages from "../../messages/fr-FR/settings-ui.json";
import germanSettingsUiMessages from "../../messages/de-DE/settings-ui.json";
import ptSettingsUiMessages from "../../messages/pt-BR/settings-ui.json";
import jaSettingsUiMessages from "../../messages/ja/settings-ui.json";
import arSettingsUiMessages from "../../messages/ar-SA/settings-ui.json";
import { mergeCatalogMessages, nestDottedMessageKeys } from "./message-overlays";
import type { PublicLocale } from "./routing";

export type SourceSettingsMessages = typeof englishSettingsMessages;
export type SettingsMessages = SourceSettingsMessages;
export type SettingsUiMessages = Record<string, unknown>;
export type SettingsSidebarItemKey = keyof SourceSettingsMessages["sidebar"]["items"];
export type SettingsSidebarHeadingKey = keyof SourceSettingsMessages["sidebar"]["headings"];

const settingsCatalogs: Record<PublicLocale, SettingsMessages> = {
	"en-GB": englishSettingsMessages,
	"en-US": mergeCatalogMessages(englishSettingsMessages, enUsSettingsOverlay),
	"zh-Hans": zhHansSettingsMessages as SettingsMessages,
	hi: hiSettingsMessages as SettingsMessages,
	"es-ES": esSettingsMessages as SettingsMessages,
	"fr-FR": frSettingsMessages as SettingsMessages,
	"de-DE": germanSettingsMessages as SettingsMessages,
	"pt-BR": ptSettingsMessages as SettingsMessages,
	ja: jaSettingsMessages as SettingsMessages,
	"ar-SA": arSettingsMessages as SettingsMessages,
};

const settingsUiCatalogs: Record<PublicLocale, SettingsUiMessages> = {
	"en-GB": englishSettingsUiMessages,
	"en-US": mergeCatalogMessages(englishSettingsUiMessages, enUsSettingsUiOverlay),
	"zh-Hans": zhHansSettingsUiMessages,
	hi: hiSettingsUiMessages,
	"es-ES": esSettingsUiMessages,
	"fr-FR": frSettingsUiMessages,
	"de-DE": germanSettingsUiMessages,
	"pt-BR": ptSettingsUiMessages,
	ja: jaSettingsUiMessages,
	"ar-SA": arSettingsUiMessages,
};

export function getSettingsMessages(locale: PublicLocale): SettingsMessages {
	return settingsCatalogs[locale];
}

export function getSettingsUiMessages(locale: PublicLocale): SettingsUiMessages {
	return nestDottedMessageKeys(settingsUiCatalogs[locale]);
}

export function getSettingsSidebarItemLabel(
	locale: PublicLocale,
	key: SettingsSidebarItemKey,
): string {
	return getSettingsMessages(locale).sidebar.items[key];
}

export function getSettingsSidebarHeading(
	locale: PublicLocale,
	key: SettingsSidebarHeadingKey,
): string {
	return getSettingsMessages(locale).sidebar.headings[key];
}
