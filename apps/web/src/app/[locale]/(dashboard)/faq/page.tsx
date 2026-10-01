import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";

import { FAQSection } from "@/components/(gateway)/sections/FAQSection";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale: locale as PublicLocale, namespace: "Site.faq" });
	return buildMetadata({
		title: t("title"),
		description: t("metadataDescription"),
		path: "/faq",
		keywords: ["AI model comparison FAQ", "AI model pricing FAQ", "AI benchmarks FAQ", "AI gateway FAQ", "BYOK FAQ"],
	});
}

export default function FAQPage() {
	return (
		<div className="container mx-auto pt-16 sm:pt-20">
			<div className="px-4 sm:px-6 lg:px-8">
				<FAQSection />
			</div>
		</div>
	);
}
