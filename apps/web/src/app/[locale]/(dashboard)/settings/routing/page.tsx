import RoutingPageClient from "./RoutingPageClient";
import { getTranslations } from "next-intl/server";
import { modelSuccessorRedirectFlag } from "@/lib/flags";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.routing")} - ${t("headers.settings")}` };
}
export default async function RoutingPage() {
	const showModelSuccessor = await modelSuccessorRedirectFlag().catch(() => false);
	return <RoutingPageClient showModelSuccessor={showModelSuccessor} />;
}
