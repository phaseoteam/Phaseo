import { useSuspenseQuery } from "@tanstack/react-query";
import { getTranslations } from "@/i18n/server";
import ModelTestPlaygroundClient from "./ModelTestPlaygroundClient";
import { modelTestPlaygroundModelsQuery } from "./models.queries";

export async function generateMetadata() {
	const t = await getTranslations("Product.internalTools.modelTestPlayground");
	return {
		title: t("pageTitle"),
		description: t("pageDescription"),
	};
}

// The admin gate (requireInternalAdmin) runs in the route's beforeLoad.
export default function ModelTestPlaygroundPage() {
	const { data: models } = useSuspenseQuery(modelTestPlaygroundModelsQuery());
	return <ModelTestPlaygroundClient models={models} />;
}
