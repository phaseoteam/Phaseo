import { useSuspenseQuery } from "@tanstack/react-query";
import { settingsApiProvidersQuery } from "../catalog.queries";
import ByokContent from "./ByokContent";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.byok")} - ${t("headers.settings")}` };
}
export default function Page() { const { data: providerCatalogData } = useSuspenseQuery(settingsApiProvidersQuery()); return <ByokContent providerCatalogData={providerCatalogData} />; }
