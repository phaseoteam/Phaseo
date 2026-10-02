import "../globals.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { RootDocument } from "@/components/layout/RootDocument";
import { getPublicMessages } from "@/i18n/messages";
import {
	getLocaleDefinition,
	isPublicLocale,
	routing,
	type PublicLocale,
} from "@/i18n/routing";
import { buildLocalizedRootMetadata } from "@/lib/rootMetadata";

export function generateStaticParams() {
	// Prerender a representative locale; the same validated route tree serves
	// every other public locale on demand. Expanding all ten root params makes
	// Vercel duplicate each dynamic/PPR matcher past its routing limit.
	return [{ locale: routing.defaultLocale }];
}

async function getValidatedLocale(
	params: LayoutProps<"/[locale]">["params"],
): Promise<PublicLocale> {
	const { locale } = await params;
	if (!isPublicLocale(locale)) notFound();
	return locale;
}

export async function generateMetadata({
	params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
	return buildLocalizedRootMetadata(await getValidatedLocale(params));
}

export default async function LocaleRootLayout({
	children,
	params,
}: LayoutProps<"/[locale]">) {
	const locale = await getValidatedLocale(params);
	const definition = getLocaleDefinition(locale);
	const messages = await getPublicMessages(locale);

	// Enables static rendering for the locale sample returned above while the
	// request configuration remains authoritative for next-intl server APIs.
	setRequestLocale(locale);

	return (
		<RootDocument
			cookieConsentCopy={messages.CookieConsent}
			locale={locale}
			direction={definition.dir}
			fontProfile={definition.font}
			messages={messages}
		>
			{children}
		</RootDocument>
	);
}
