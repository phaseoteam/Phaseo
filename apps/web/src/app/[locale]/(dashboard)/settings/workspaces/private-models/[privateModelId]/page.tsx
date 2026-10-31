import { use } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import CachedPrivateModelEditor from "@/components/(gateway)/settings/private-models/CachedPrivateModelEditor";
import { settingsPrivateModelCatalogQuery } from "../../../catalog.queries";
import { getTranslations } from "@/i18n/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("privateModelsCopy.privateModel")} - ${t("headers.settings")}` };
}
export default function PrivateModelPage({ params }: { params: Promise<{ privateModelId: string }> }) {
	const { privateModelId } = use(params);
	// Only model IDs and names are used, so skip the gateway enrichment.
	const { data: { catalogModels, providers } } = useSuspenseQuery(settingsPrivateModelCatalogQuery());
	return <CachedPrivateModelEditor privateModelId={privateModelId} catalogModels={catalogModels} providers={providers} />;
}
