import { useParams, useSearch } from "@tanstack/react-router";
import { useSuspenseQueries } from "@tanstack/react-query";
import ByokProviderContent from "./ByokProviderContent";
import { settingsApiProviderHeaderQuery, settingsApiProviderModelsQuery } from "../../catalog.queries";
import { getTranslations } from "@/i18n/server";
export async function getByokProviderMetadata() { const t = await getTranslations("SettingsUI.byokProviderPageCopy"); return { title: t("pageTitle") + " - BYOK" }; }
export default function ByokProviderPage() {
	const { providerId: encodedId } = useParams({ from: "/{-$locale}/_dashboard/settings/byok/$providerId/" });
	const { sampleKeys } = useSearch({ from: "/{-$locale}/_dashboard/settings/byok/$providerId/" }) as { sampleKeys?: string };
	const providerId = decodeURIComponent(encodedId);
	const [{ data: catalogProvider }, { data: providerModels }] = useSuspenseQueries({ queries: [settingsApiProviderHeaderQuery(providerId), settingsApiProviderModelsQuery(providerId)] });
	return <ByokProviderContent providerId={providerId} sampleKeys={sampleKeys} catalogProvider={catalogProvider} providerModels={providerModels} />;
}
