import englishFeedbackMessages from "../../messages/en-GB/feedback.json";
import enUsOverlay from "../../messages/en-US/feedback.overrides.json";
import zhHans from "../../messages/zh-Hans/feedback.json";
import hi from "../../messages/hi/feedback.json";
import es from "../../messages/es-ES/feedback.json";
import fr from "../../messages/fr-FR/feedback.json";
import germanFeedbackMessages from "../../messages/de-DE/feedback.json";
import pt from "../../messages/pt-BR/feedback.json";
import ja from "../../messages/ja/feedback.json";
import ar from "../../messages/ar-SA/feedback.json";
import { mergeCatalogMessages } from "./message-overlays";
import type { PublicLocale } from "./routing";
export type FeedbackMessages = typeof englishFeedbackMessages;
const catalogs: Record<PublicLocale, FeedbackMessages> = { "en-GB": englishFeedbackMessages, "en-US": mergeCatalogMessages(englishFeedbackMessages, enUsOverlay), "zh-Hans": zhHans as FeedbackMessages, hi: hi as FeedbackMessages, "es-ES": es as FeedbackMessages, "fr-FR": fr as FeedbackMessages, "de-DE": germanFeedbackMessages, "pt-BR": pt as FeedbackMessages, ja: ja as FeedbackMessages, "ar-SA": ar as FeedbackMessages };
export function getFeedbackMessages(locale: PublicLocale): FeedbackMessages { return catalogs[locale]; }
