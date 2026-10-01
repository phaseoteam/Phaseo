import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { getTranslations } from "next-intl/server";
import ModelTestPlaygroundClient from "./ModelTestPlaygroundClient";

export async function generateMetadata() {
	const t = await getTranslations("Product.internalTools.modelTestPlayground");
	return {
		title: t("pageTitle"),
		description: t("pageDescription"),
	};
}

export default async function ModelTestPlaygroundPage() {
	await requireInternalAdmin();
	const models = await fetchFrontendGatewayModels();
	return <ModelTestPlaygroundClient models={models} />;
}
