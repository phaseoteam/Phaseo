"use client";

// web-start renders every page with the locale's full catalogue (see
// RootIntlProvider), so scoped dictionaries are no longer fetched: a scope
// reference passes children through, and explicit messages still merge in.
import { useMemo, type ReactNode } from "react";
import { AppIntlProvider, useLocale, useMessages, useTimeZone, type AbstractIntlMessages } from "@/i18n/react";
import type { ClientMessagesSource } from "@/i18n/client-message-source";

export { AppIntlProvider as LocaleMessagesProvider } from "@/i18n/react";

function combineMessages(parent: AbstractIntlMessages, feature: AbstractIntlMessages): AbstractIntlMessages {
	const out: Record<string, unknown> = { ...(parent as Record<string, unknown>) };
	for (const [key, value] of Object.entries(feature as Record<string, unknown>)) {
		const existing = out[key];
		out[key] = existing && typeof existing === "object" && value && typeof value === "object" && !Array.isArray(value)
			? combineMessages(existing as AbstractIntlMessages, value as AbstractIntlMessages)
			: value;
	}
	return out as AbstractIntlMessages;
}

/** The document root used to load shell copy here; RootIntlProvider does that now. */
export function ClientMessagesProvider({ children }: { children: ReactNode; locale?: string; source?: ClientMessagesSource; timeZone?: string }) {
	return <>{children}</>;
}

/** A route or feature boundary: explicit messages merge into the inherited catalogue. */
export function FeatureMessagesProvider({ children, messages }: { children: ReactNode; messages?: AbstractIntlMessages; source?: ClientMessagesSource }) {
	if (!messages) return <>{children}</>;
	return <MergedMessages messages={messages}>{children}</MergedMessages>;
}

function MergedMessages({ children, messages }: { children: ReactNode; messages: AbstractIntlMessages }) {
	const parent = useMessages() as unknown as AbstractIntlMessages;
	const locale = useLocale();
	const timeZone = useTimeZone();
	const combined = useMemo(() => combineMessages(parent, messages), [parent, messages]);
	return <AppIntlProvider locale={locale} timeZone={timeZone} messages={combined}>{children}</AppIntlProvider>;
}
