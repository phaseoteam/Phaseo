import { use } from "react";
import { useSuspenseQueries } from "@tanstack/react-query";
import ByokProviderContent from "./ByokProviderContent";
import { settingsApiProviderHeaderQuery, settingsApiProviderModelsQuery } from "../../catalog.queries";
import { getTranslations } from "@/i18n/server";
export async function generateMetadata() { const t = await getTranslations("SettingsUI.byokProviderPageCopy"); return { title: t("pageTitle") + " - BYOK" }; }
export default function Page({ params, searchParams }: { params: Promise<{ providerId: string }>; searchParams: Promise<{ sampleKeys?: string }> }) {
	const { providerId: encodedId } = use(params);
	const { sampleKeys } = use(searchParams);
	const providerId = decodeURIComponent(encodedId);
	const [{ data: catalogProvider }, { data: providerModels }] = useSuspenseQueries({ queries: [settingsApiProviderHeaderQuery(providerId), settingsApiProviderModelsQuery(providerId)] });
	return <ByokProviderContent providerId={providerId} sampleKeys={sampleKeys} catalogProvider={catalogProvider} providerModels={providerModels} />;
}
