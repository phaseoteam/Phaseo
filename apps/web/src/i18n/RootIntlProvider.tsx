// The whole site renders with the locale's full catalogue. The server reads it
// from the bundled catalogue; browsers load the same content once from
// /api/i18n-full/<locale>?v=<build> (immutable), so it never sits in the HTML.
import { createIsomorphicFn } from "@tanstack/react-start";
import { use, type ReactNode } from "react";
import type { AbstractIntlMessages } from "use-intl";
import { NextIntlClientProvider } from "next-intl";
import type { PublicLocale } from "@/i18n/locales";

declare const __PHASEO_BUILD_ID__: string;

export function fullMessagesUrl(locale: string): string {
	return `/api/i18n-full/${locale}?v=${__PHASEO_BUILD_ID__}`;
}

const pending = new Map<string, Promise<AbstractIntlMessages>>();

const loadMessages = createIsomorphicFn()
	.server(async (locale: PublicLocale): Promise<AbstractIntlMessages> => {
		const { getPublicMessages } = await import("@/i18n/messages");
		return (await getPublicMessages(locale)) as unknown as AbstractIntlMessages;
	})
	.client(async (locale: PublicLocale): Promise<AbstractIntlMessages> => {
		for (let attempt = 0; ; attempt++) {
			try {
				const response = await fetch(fullMessagesUrl(locale), { credentials: "omit" });
				if (!response.ok) throw new Error(`Messages ${locale} returned ${response.status}`);
				return (await response.json()) as AbstractIntlMessages;
			} catch (error) {
				if (attempt >= 2) throw error;
				await new Promise((resolve) => setTimeout(resolve, 250 * 4 ** attempt));
			}
		}
	});

export function getFullMessages(locale: PublicLocale): Promise<AbstractIntlMessages> {
	let promise = pending.get(locale);
	if (!promise) {
		promise = loadMessages(locale);
		pending.set(locale, promise);
		promise.catch(() => pending.delete(locale));
	}
	return promise;
}

export function RootIntlProvider({ locale, children }: { locale: PublicLocale; children: ReactNode }) {
	const messages = use(getFullMessages(locale));
	return (
		<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
			{children}
		</NextIntlClientProvider>
	);
}
