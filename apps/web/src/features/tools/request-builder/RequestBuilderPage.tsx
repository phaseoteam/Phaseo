import { PageMetadata } from "@/lib/seo/metadataTypes";
import { buildMetadata } from "@/lib/seo";
import RequestBuilder from "@/components/(tools)/RequestBuilder";
import { useSuspenseQuery } from "@tanstack/react-query";
import { requestBuilderModelsQuery } from "./page.queries";
import { getTranslations } from "@/i18n/server";

export async function getRequestBuilderMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.tools.request");
	return buildMetadata({
		title: t("title"),
		description: t("description"),
		path: "/tools/request-builder",
	});
}

export function RequestBuilderPage() {
    const { data: models } = useSuspenseQuery(requestBuilderModelsQuery());

    return <RequestBuilder models={models} />;
}
