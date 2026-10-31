import { Metadata } from "@/lib/seo/metadataTypes";
import { buildMetadata } from "@/lib/seo";
import RequestBuilder from "@/components/(tools)/RequestBuilder";
import { useSuspenseQuery } from "@tanstack/react-query";
import { requestBuilderModelsQuery } from "./page.queries";
import { getTranslations } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.tools.request");
	return buildMetadata({
		title: t("title"),
		description: t("description"),
		path: "/tools/request-builder",
	});
}

export default function RequestBuilderPage() {
    const { data: models } = useSuspenseQuery(requestBuilderModelsQuery());

    return <RequestBuilder models={models} />;
}
