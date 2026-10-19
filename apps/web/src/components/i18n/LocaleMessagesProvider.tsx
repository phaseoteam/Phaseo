"use client";

// Tests and previews that already hold a dictionary pass it straight to the
// client entry, which avoids next-intl's server wrapper reading request headers.
export { NextIntlClientProvider as LocaleMessagesProvider } from "next-intl";

import { NextIntlClientProvider, useLocale, useMessages, useTimeZone, type AbstractIntlMessages, type Locale } from "next-intl";
import { use, useMemo, type ReactNode } from "react";
import { combineMessages } from "@/i18n/message-scopes";
import { fetchClientMessages, type ClientMessagesSource } from "@/i18n/client-message-source";

type LoadedMessages = { promise: Promise<AbstractIntlMessages>; value?: AbstractIntlMessages; error?: unknown };

const loaded = new Map<string, LoadedMessages>();

/**
 * Pages carry a reference, never the dictionary. While rendering on the server
 * the provider reads what its server boundary prepared; in the browser it loads
 * the published file once (preloaded by the boundary) and caches it.
 */
function useClientMessages(source: ClientMessagesSource | undefined): AbstractIntlMessages | undefined {
	if (!source) return undefined;
	if (typeof window === "undefined") {
		const prepared = globalThis.__phaseoClientMessages?.get(source.key);
		if (prepared) return prepared;
		const load = globalThis.__phaseoLoadClientMessages;
		if (!load) throw new Error(`Translations ${source.key} were not prepared on the server`);
		return use(load(source));
	}
	let entry = loaded.get(source.key);
	if (!entry) {
		const created: LoadedMessages = { promise: fetchClientMessages(source) };
		created.promise.then((value) => { created.value = value; }, (error: unknown) => { created.error = error; });
		loaded.set(source.key, created);
		entry = created;
	}
	if (entry.error !== undefined) {
		// Hand the failure to the error boundary; a later render (its retry, or a
		// navigation) starts a fresh load instead of this render refetching.
		loaded.delete(source.key);
		throw entry.error;
	}
	return entry.value ?? use(entry.promise);
}

/** The document root: shared shell copy for every page. */
export function ClientMessagesProvider({ children, locale, source, timeZone }: {
	children: ReactNode;
	locale: Locale;
	source: ClientMessagesSource;
	timeZone: string;
}) {
	const messages = useClientMessages(source);
	return <NextIntlClientProvider locale={locale} timeZone={timeZone} messages={messages}>{children}</NextIntlClientProvider>;
}

/** A route or feature boundary: adds its copy to the inherited dictionary. */
export function FeatureMessagesProvider({ children, messages, source }: { children: ReactNode } & (
	| { messages: AbstractIntlMessages; source?: never }
	| { messages?: never; source: ClientMessagesSource }
)) {
	const parent = useMessages();
	const locale = useLocale();
	const timeZone = useTimeZone();
	const feature = useClientMessages(source) ?? messages;
	const combined = useMemo(() => combineMessages(parent, feature ?? {}), [parent, feature]);
	return <NextIntlClientProvider locale={locale} timeZone={timeZone} messages={combined}>{children}</NextIntlClientProvider>;
}
