import ModelUpdatesPage from "@/components/(data)/models/ModelUpdates/ModelUpdates";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { buildMetadata } from "@/lib/seo";
import { useSuspenseQuery } from "@tanstack/react-query";
import { modelUpdatesQuery } from "./page.queries";
import { getTranslations } from "@/i18n/server";
import type { RuntimeLocale } from "@/i18n/locales";
import type { RouteMetadataInput } from "@/lib/start/metadata";

export async function getUpdatesModelsMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const locale = params.locale as RuntimeLocale;
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

export default function UpdatesModelsPage() {
	const { data: { past: pastEvents, future: upcomingEvents } } =
		useSuspenseQuery(modelUpdatesQuery(4));

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
