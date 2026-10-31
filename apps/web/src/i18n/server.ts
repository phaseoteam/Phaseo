// `next-intl/server` for loaders, server functions, metadata and route
// handlers. Components use the client hooks instead (see PORTING.md).
import { createFormatter, createTranslator, type AbstractIntlMessages } from "use-intl/core";
import { getPublicMessages } from "@/i18n/messages";
import { defaultLocale, isPublicLocale, type PublicLocale } from "@/i18n/locales";
import { getCurrentRequestUrl } from "@/compat/request-context";

type LocaleArg = { locale?: string; namespace?: string } | string | undefined;

export async function getLocale(): Promise<PublicLocale> {
	if (typeof window !== "undefined") {
		const first = window.location.pathname.split("/")[1] ?? "";
		return isPublicLocale(first) ? first : defaultLocale;
	}
	const url = getCurrentRequestUrl();
	const first = url ? (url.pathname.split("/")[1] ?? "") : "";
	return isPublicLocale(first) ? first : defaultLocale;
}

async function resolve(arg: LocaleArg): Promise<{ locale: PublicLocale; namespace?: string }> {
	const options = typeof arg === "string" ? { namespace: arg } : arg ?? {};
	const locale = options.locale && isPublicLocale(options.locale) ? options.locale : await getLocale();
	return { locale, namespace: options.namespace };
}

export async function getMessages(arg?: { locale?: string }): Promise<AbstractIntlMessages> {
	const { locale } = await resolve(arg);
	return (await getPublicMessages(locale)) as unknown as AbstractIntlMessages;
}

export async function getTranslations(arg?: LocaleArg) {
	if (typeof window !== "undefined") {
		throw new Error("getTranslations from next-intl/server runs on the server only. Use useTranslations in components, or call it inside createServerFn.");
	}
	const { locale, namespace } = await resolve(arg);
	const messages = (await getPublicMessages(locale)) as unknown as AbstractIntlMessages;
	return createTranslator({ locale, messages, namespace: namespace as never, timeZone: "UTC" }) as ReturnType<typeof createTranslator> & ((key: string, values?: Record<string, unknown>) => string);
}

export async function getFormatter(arg?: { locale?: string }) {
	const { locale } = await resolve(arg);
	return createFormatter({ locale, timeZone: "UTC" });
}

export async function getNow(): Promise<Date> {
	return new Date();
}

export async function getTimeZone(): Promise<string> {
	return "UTC";
}

export function setRequestLocale(_locale: string): void {
	// The locale comes from the URL in web-start; nothing to store.
}
