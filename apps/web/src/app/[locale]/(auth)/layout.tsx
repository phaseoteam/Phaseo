import { use } from "react";
import type { Metadata } from "@/lib/seo/metadataTypes";
import { notFound } from "@/lib/navigation";
import { isPublicLocale } from "@/i18n/routing";

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
	return <>{children}</>;
}
