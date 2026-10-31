import { use } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isPublicLocale } from "@/i18n/routing";
import { ScopedMessages } from "@/components/i18n/ScopedMessages";

export const metadata: Metadata = {
	robots: {
		index: false,
		follow: false,
	},
};

export default function LocalizedAuthLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}) {
	const { locale } = use(params);
	if (!isPublicLocale(locale)) notFound();
	return <ScopedMessages params={params} namespaces={["Auth", "Common.authFlows", "SettingsUI.passwordStrength", "SettingsUI.oauthAppsPage.alphaLabel"]}>{children}</ScopedMessages>;
}
