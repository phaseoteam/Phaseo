// The whole site renders with the locale's full catalogue. The server reads it
// from the bundled catalogue; browsers load the same content once from
// /api/i18n-full/<locale>?v=<build> (immutable), so it never sits in the HTML.
import { createIsomorphicFn } from "@tanstack/react-start";
import { use, type ReactNode } from "react";
import type { AbstractIntlMessages } from "use-intl";
import { AppIntlProvider } from "@/i18n/react";
import type { PublicLocale } from "@/i18n/locales";
import { getCurrentRequest } from "@/lib/start/request-context";

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

// On the server each request gets its own promise (Workers must not await
// another request's I/O); the catalogue itself is cached settled by
// getPublicMessages.
const perRequest = new WeakMap<object, Map<string, Promise<AbstractIntlMessages>>>();

/** A stable promise per locale (per request on the server) for React's use(). */
export function getFullMessages(locale: PublicLocale): Promise<AbstractIntlMessages> {
	const request = typeof window === "undefined" ? getCurrentRequest() : undefined;
	let cache = pending;
	if (request) {
		cache = perRequest.get(request) ?? new Map();
		perRequest.set(request, cache);
	}
	let promise = cache.get(locale);
	if (!promise) {
		promise = loadMessages(locale);
		cache.set(locale, promise);
		const owner = cache;
		promise.catch(() => owner.delete(locale));
	}
	return promise;
}

export function RootIntlProvider({ locale, children }: { locale: PublicLocale; children: ReactNode }) {
	const messages = use(getFullMessages(locale));
	return (
		<AppIntlProvider locale={locale} messages={messages} timeZone="UTC">
			{children}
		</AppIntlProvider>
	);
}
