import { getTranslations } from "@/i18n/server";
import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { privateUsageScopeQuery } from "../usage.functions";
import GeographyClient from "./GeographyClient";


export async function getUsageGeographyMetadata() { const t = await getTranslations("SettingsUI.settingsPageMetadata"); return { title: t("geography") }; }
function GeographyContent() {
	const { data: scope } = useSuspenseQuery(privateUsageScopeQuery());
	return <GeographyClient key={`${scope.userId}:${scope.workspaceId}`} scope={scope} />;
}

export default function GeographyPage() {
	return <Suspense fallback={<SettingsSectionFallback />}><GeographyContent /></Suspense>;
}
