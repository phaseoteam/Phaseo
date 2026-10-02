import englishRedeemMessages from "../../messages/en-GB/redeem.json";
import enUsOverlay from "../../messages/en-US/redeem.overrides.json";
import zhHans from "../../messages/zh-Hans/redeem.json";
import hi from "../../messages/hi/redeem.json";
import es from "../../messages/es-ES/redeem.json";
import fr from "../../messages/fr-FR/redeem.json";
import germanRedeemMessages from "../../messages/de-DE/redeem.json";
import pt from "../../messages/pt-BR/redeem.json";
import ja from "../../messages/ja/redeem.json";
import ar from "../../messages/ar-SA/redeem.json";
import { mergeCatalogMessages } from "./message-overlays";
import type { PublicLocale } from "./routing";
export type RedeemMessages = typeof englishRedeemMessages;
const catalogs: Record<PublicLocale, RedeemMessages> = { "en-GB": englishRedeemMessages, "en-US": mergeCatalogMessages(englishRedeemMessages, enUsOverlay), "zh-Hans": zhHans as RedeemMessages, hi: hi as RedeemMessages, "es-ES": es as RedeemMessages, "fr-FR": fr as RedeemMessages, "de-DE": germanRedeemMessages, "pt-BR": pt as RedeemMessages, ja: ja as RedeemMessages, "ar-SA": ar as RedeemMessages };
export function getRedeemMessages(locale: PublicLocale): RedeemMessages { return catalogs[locale]; }
