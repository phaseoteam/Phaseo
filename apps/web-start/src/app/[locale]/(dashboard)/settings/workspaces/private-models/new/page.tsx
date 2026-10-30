import { useSuspenseQuery } from "@tanstack/react-query";
import CachedPrivateModelEditor from "@/components/(gateway)/settings/private-models/CachedPrivateModelEditor";
import { settingsPrivateModelCatalogQuery } from "../../../catalog.queries";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("privateModelsCopy.newModel")} - ${t("headers.settings")}` };
}
export default function NewPrivateModelPage() {
	// Only model IDs and names are used, so skip the gateway enrichment.
	const { data: { catalogModels, providers } } = useSuspenseQuery(settingsPrivateModelCatalogQuery());
	return <CachedPrivateModelEditor catalogModels={catalogModels} providers={providers} />;
}
