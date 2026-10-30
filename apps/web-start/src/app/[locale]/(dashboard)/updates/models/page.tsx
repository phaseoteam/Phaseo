import ModelUpdatesPage from "@/components/(data)/models/ModelUpdates/ModelUpdates";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendModelUpdates } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { getTranslations } from "next-intl/server";
import type { RuntimeLocale } from "@/i18n/locales";

export async function generateMetadata(props: {
	params: Promise<{ locale: RuntimeLocale }>;
}): Promise<Metadata> {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "Catalogue.updatesMetadata" });
	return buildMetadata({
		title: t("modelTitle"),
		description: t("modelDescription"),
		path: "/updates/models",
		keywords: [
			"AI model updates",
			"LLM updates",
			"AI releases",
			"model changelog",
			"AI benchmarks",
			"new AI models",
			"Phaseo",
			"GPT-5.1",
			"Claude 4.5",
			"Gemini 2.5",
			"Grok 4",
		],
	});
}

export default async function Page() {
	const { past: pastEvents, future: upcomingEvents } =
		await fetchFrontendModelUpdates({
			includeAllPast: true,
			upcomingLimit: 4,
		});

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto flex flex-1">
				<div className="flex-1">
					<ModelUpdatesPage
						pastEvents={pastEvents}
						upcomingEvents={upcomingEvents}
					/>
				</div>
			</div>
		</main>
	);
}
