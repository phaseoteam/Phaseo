import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { FeatureMessagesProvider } from "./LocaleMessagesProvider";
import { getPublicMessages } from "@/i18n/messages";
import { selectClientMessages } from "@/i18n/client-message-selection";
import { isPublicLocale } from "@/i18n/routing";

export type ScopedLayoutProps = {
	children: ReactNode;
	params: Promise<{ locale: string }>;
};

export async function ScopedMessages({ children, params, namespaces }: ScopedLayoutProps & {
	namespaces: readonly string[];
}) {
	const { locale } = await params;
	if (!isPublicLocale(locale)) notFound();
	const messages = selectClientMessages(await getPublicMessages(locale), namespaces);
	return <FeatureMessagesProvider messages={messages}>{children}</FeatureMessagesProvider>;
}

export function createScopedMessagesLayout(namespaces: readonly string[]) {
	return async function ScopedMessagesLayout(props: ScopedLayoutProps) {
		return <ScopedMessages {...props} namespaces={namespaces} />;
	};
}

// Templates receive only children. The locale is already validated and set on
// next-intl's request cache by the root layout (including static prerenders).
export function createScopedMessagesTemplate(namespaces: readonly string[]) {
	return async function ScopedMessagesTemplate({ children }: { children: ReactNode }) {
		const locale = await getLocale();
		return <ScopedMessages params={Promise.resolve({ locale })} namespaces={namespaces}>{children}</ScopedMessages>;
	};
}
