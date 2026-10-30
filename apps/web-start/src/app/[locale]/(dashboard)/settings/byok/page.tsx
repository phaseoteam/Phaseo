import { fetchFrontendAPIProviders } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import ByokContent from "./ByokContent";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.byok")} - ${t("headers.settings")}` };
}
export default async function Page() { return <ByokContent providerCatalogData={await fetchFrontendAPIProviders()} />; }
