import { defaultLocale, isPublicLocale, type PublicLocale } from "@/i18n/locales";
import { getPaymentMethodsMessages, type PaymentMethodsMessages } from "@/i18n/payment-methods";

export type CheckoutLanguage = {
	/** Stripe Checkout `locale`: "en" for English buyers, so USD shows as "$" not "US$"; otherwise unset (Stripe follows the browser). */
	stripeLocale: "en" | undefined;
	copy: PaymentMethodsMessages["checkout"];
};

// Primary language subtag -> the catalogue that covers it.
const CATALOGUE_BY_LANGUAGE: Record<string, string> = {
	zh: "zh-Hans",
	hi: "hi",
	es: "es-ES",
	fr: "fr-FR",
	de: "de-DE",
	pt: "pt-BR",
	ja: "ja",
	ar: "ar-SA",
};

const ENGLISH: CheckoutLanguage = { stripeLocale: "en", copy: getPaymentMethodsMessages(defaultLocale).checkout };

/**
 * Checkout language from the buyer's Accept-Language. English (or no header) pins Stripe to "en".
 * Other languages leave Stripe on its browser default and use our matching catalogue for the
 * product copy, falling back to English copy when we have no public catalogue for that language.
 */
export function resolveCheckoutLanguage(acceptLanguage: string | null | undefined): CheckoutLanguage {
	const primary = String(acceptLanguage ?? "").split(",")[0]?.split(";")[0]?.trim().toLowerCase() ?? "";
	const language = primary.split("-")[0] ?? "";
	if (!language || language === "*" || language === "en") return ENGLISH;
	const catalogue = CATALOGUE_BY_LANGUAGE[language];
	const copy = catalogue && isPublicLocale(catalogue) ? getPaymentMethodsMessages(catalogue as PublicLocale).checkout : ENGLISH.copy;
	return { stripeLocale: undefined, copy };
}

/** Fixed English, for sessions whose params must not vary between requests (idempotent API/CLI top-ups). */
export function englishCheckoutLanguage(): CheckoutLanguage {
	return ENGLISH;
}
