import en from "../../messages/en-GB/subscription-plans.json";
import enUsOverlay from "../../messages/en-US/subscription-plans.overrides.json";
import zhHans from "../../messages/zh-Hans/subscription-plans.json";
import hi from "../../messages/hi/subscription-plans.json";
import es from "../../messages/es-ES/subscription-plans.json";
import fr from "../../messages/fr-FR/subscription-plans.json";
import de from "../../messages/de-DE/subscription-plans.json";
import pt from "../../messages/pt-BR/subscription-plans.json";
import ja from "../../messages/ja/subscription-plans.json";
import ar from "../../messages/ar-SA/subscription-plans.json";
import { mergeCatalogMessages } from "./message-overlays";
import { isPublicLocale, type PublicLocale } from "./routing";
export type SubscriptionPlansMessages = typeof en;
const catalogs: Record<PublicLocale, SubscriptionPlansMessages> = { "en-GB": en, "en-US": mergeCatalogMessages(en, enUsOverlay), "zh-Hans": zhHans as SubscriptionPlansMessages, hi: hi as SubscriptionPlansMessages, "es-ES": es as SubscriptionPlansMessages, "fr-FR": fr as SubscriptionPlansMessages, "de-DE": de as SubscriptionPlansMessages, "pt-BR": pt as SubscriptionPlansMessages, ja: ja as SubscriptionPlansMessages, "ar-SA": ar as SubscriptionPlansMessages };
export function getSubscriptionPlansMessages(locale: PublicLocale): SubscriptionPlansMessages { return catalogs[locale]; }
export function getSubscriptionPlansMessagesFor(locale: string): SubscriptionPlansMessages {
	return isPublicLocale(locale) ? catalogs[locale] : catalogs["en-GB"];
}

export function formatSubscriptionPlanMessage(
	message: string,
	values: Record<string, string | number>,
): string {
	return message.replace(/\{([^}]+)\}/g, (placeholder, key: string) =>
		key in values ? String(values[key]) : placeholder,
	);
}
