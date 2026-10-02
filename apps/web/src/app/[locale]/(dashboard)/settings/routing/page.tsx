import RoutingPageClient from "./RoutingPageClient";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.routing")} - ${t("headers.settings")}` };
}
export default function RoutingPage() { return <RoutingPageClient />; }
