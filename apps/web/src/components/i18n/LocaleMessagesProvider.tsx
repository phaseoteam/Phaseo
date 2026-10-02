"use client";

// The root document supplies the locale and shared message tree. Using the
// client entry avoids next-intl's server wrapper reading request headers again
// while Next.js prerenders this shared shell.
export { NextIntlClientProvider as LocaleMessagesProvider } from "next-intl";

import { NextIntlClientProvider, useLocale, useMessages, useTimeZone, type AbstractIntlMessages } from "next-intl";
import { useMemo, type ReactNode } from "react";
import { combineMessages } from "@/i18n/message-scopes";

export function FeatureMessagesProvider({ children, messages }: {
	children: ReactNode;
	messages: AbstractIntlMessages;
}) {
	const parent = useMessages();
	const locale = useLocale();
	const timeZone = useTimeZone();
	const combined = useMemo(() => combineMessages(parent, messages), [parent, messages]);
	return <NextIntlClientProvider locale={locale} timeZone={timeZone} messages={combined}>{children}</NextIntlClientProvider>;
}
