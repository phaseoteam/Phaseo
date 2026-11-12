import type { PageMetadata } from "@/lib/seo/metadataTypes";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { getTranslations } from "@/i18n/server";
import type { PublicLocale } from "@/i18n/routing";

import { FAQSection } from "@/components/(gateway)/sections/FAQSection";
import { buildMetadata } from "@/lib/seo";

export async function getFaqMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const { locale } = params as { locale: PublicLocale };
	const t = await getTranslations({ locale: locale as PublicLocale, namespace: "Site.faq" });
	return buildMetadata({
		title: t("title"),
		description: t("metadataDescription"),
		path: "/faq",
		keywords: ["AI model comparison FAQ", "AI model pricing FAQ", "AI benchmarks FAQ", "AI gateway FAQ", "BYOK FAQ"],
	});
}

export function FaqPage() {
	return (
		<div className="container mx-auto pt-16 sm:pt-20">
			<div className="px-4 sm:px-6 lg:px-8">
				<FAQSection />
			</div>
		</div>
	);
}
