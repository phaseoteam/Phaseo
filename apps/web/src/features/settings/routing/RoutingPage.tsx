import RoutingPageClient from "./RoutingPageClient";
import { getTranslations } from "@/i18n/server";
import { useSuspenseQuery } from "@tanstack/react-query";
import { settingsFlagQuery } from "../settings.functions";
export async function getRoutingMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.routing")} - ${t("headers.settings")}` };
}
export default function RoutingPage() {
	const { data: showModelSuccessor } = useSuspenseQuery(settingsFlagQuery("modelSuccessorRedirect", { safe: true }));
	return <RoutingPageClient showModelSuccessor={showModelSuccessor} />;
}
