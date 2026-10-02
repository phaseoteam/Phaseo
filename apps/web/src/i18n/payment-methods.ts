import en from "../../messages/en-GB/payment-methods.json";
import enUsOverlay from "../../messages/en-US/payment-methods.overrides.json";
import zhHans from "../../messages/zh-Hans/payment-methods.json";
import hi from "../../messages/hi/payment-methods.json";
import es from "../../messages/es-ES/payment-methods.json";
import fr from "../../messages/fr-FR/payment-methods.json";
import de from "../../messages/de-DE/payment-methods.json";
import pt from "../../messages/pt-BR/payment-methods.json";
import ja from "../../messages/ja/payment-methods.json";
import ar from "../../messages/ar-SA/payment-methods.json";
import { mergeCatalogMessages } from "./message-overlays";
import type { PublicLocale } from "./routing";
export type PaymentMethodsMessages = typeof en;
const catalogs: Record<PublicLocale, PaymentMethodsMessages> = {
	"en-GB": en,
	"en-US": mergeCatalogMessages(en, enUsOverlay),
	"zh-Hans": zhHans as PaymentMethodsMessages,
	hi: hi as PaymentMethodsMessages,
	"es-ES": es as PaymentMethodsMessages,
	"fr-FR": fr as PaymentMethodsMessages,
	"de-DE": de as PaymentMethodsMessages,
	"pt-BR": pt as PaymentMethodsMessages,
	ja: ja as PaymentMethodsMessages,
	"ar-SA": ar as PaymentMethodsMessages,
};
export function getPaymentMethodsMessages(locale: PublicLocale): PaymentMethodsMessages { return catalogs[locale]; }
