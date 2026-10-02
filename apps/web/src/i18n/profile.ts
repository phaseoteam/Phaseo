import englishProfileMessages from "../../messages/en-GB/profile.json";
import { mergeCatalogMessages } from "./message-overlays";
import type { PublicLocale } from "./routing";

import zhHans from "../../messages/zh-Hans/profile.json";
import hi from "../../messages/hi/profile.json";
import es from "../../messages/es-ES/profile.json";
import fr from "../../messages/fr-FR/profile.json";
import de from "../../messages/de-DE/profile.json";
import pt from "../../messages/pt-BR/profile.json";
import ja from "../../messages/ja/profile.json";
import ar from "../../messages/ar-SA/profile.json";
import enUsOverlay from "../../messages/en-US/profile.overrides.json";

export type ProfileMessages = typeof englishProfileMessages;
const profileCatalogs: Record<PublicLocale, ProfileMessages> = {
	"en-GB": englishProfileMessages,
	"en-US": mergeCatalogMessages(englishProfileMessages, enUsOverlay),
	"zh-Hans": zhHans as ProfileMessages,
	hi: hi as ProfileMessages,
	"es-ES": es as ProfileMessages,
	"fr-FR": fr as ProfileMessages,
	"de-DE": de as ProfileMessages,
	"pt-BR": pt as ProfileMessages,
	ja: ja as ProfileMessages,
	"ar-SA": ar as ProfileMessages,
};
export function getProfileMessages(locale: PublicLocale): ProfileMessages {
	return profileCatalogs[locale];
}
