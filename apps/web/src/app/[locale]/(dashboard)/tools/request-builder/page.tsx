import { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import RequestBuilder from "@/components/(tools)/RequestBuilder";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.tools.request");
	return buildMetadata({
		title: t("title"),
		description: t("description"),
		path: "/tools/request-builder",
	});
}

export default async function RequestBuilderPage() {
    const models = await fetchFrontendGatewayModels();

    return <RequestBuilder models={models} />;
}
