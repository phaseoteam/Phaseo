import en from "../../messages/en-GB/beta.json";
import enUsOverlay from "../../messages/en-US/beta.overrides.json";
import zhHans from "../../messages/zh-Hans/beta.json";
import hi from "../../messages/hi/beta.json";
import es from "../../messages/es-ES/beta.json";
import fr from "../../messages/fr-FR/beta.json";
import de from "../../messages/de-DE/beta.json";
import pt from "../../messages/pt-BR/beta.json";
import ja from "../../messages/ja/beta.json";
import ar from "../../messages/ar-SA/beta.json";
import { mergeCatalogMessages } from "./message-overlays";
import type { PublicLocale } from "./routing";
export type BetaMessages = typeof en;
const catalogs: Record<PublicLocale, BetaMessages> = { "en-GB": en, "en-US": mergeCatalogMessages(en, enUsOverlay), "zh-Hans": zhHans as BetaMessages, hi: hi as BetaMessages, "es-ES": es as BetaMessages, "fr-FR": fr as BetaMessages, "de-DE": de, "pt-BR": pt as BetaMessages, ja: ja as BetaMessages, "ar-SA": ar as BetaMessages };
export function getBetaMessages(locale: PublicLocale): BetaMessages { return catalogs[locale]; }
