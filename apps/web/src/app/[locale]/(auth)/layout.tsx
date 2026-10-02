import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { isPublicLocale } from "@/i18n/routing";

export const metadata: Metadata = {
	robots: {
		index: false,
		follow: false,
	},
};

export default async function LocalizedAuthLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	if (!isPublicLocale(locale)) notFound();
	setRequestLocale(locale);

	return children;
}
