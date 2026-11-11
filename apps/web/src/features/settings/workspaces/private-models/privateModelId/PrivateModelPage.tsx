import { useParams } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import CachedPrivateModelEditor from "@/components/(gateway)/settings/private-models/CachedPrivateModelEditor";
import { settingsPrivateModelCatalogQuery } from "../../../catalog.queries";
import { getTranslations } from "@/i18n/server";
export async function getPrivateModelMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("privateModelsCopy.privateModel")} - ${t("headers.settings")}` };
}
export default function PrivateModelPage() {
	const { privateModelId } = useParams({ from: "/{-$locale}/_dashboard/settings/workspaces/private-models/$privateModelId/" });
	// Only model IDs and names are used, so skip the gateway enrichment.
	const { data: { catalogModels, providers } } = useSuspenseQuery(settingsPrivateModelCatalogQuery());
	return <CachedPrivateModelEditor privateModelId={privateModelId} catalogModels={catalogModels} providers={providers} />;
}
