import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { getPrivateUsageScope } from "@/lib/fetchers/internal/getPrivateUsageScope";
import GeographyClient from "./GeographyClient";


export async function generateMetadata() { const t = await getTranslations("SettingsUI.settingsPageMetadata"); return { title: t("geography") }; }
async function GeographyContent() {
	const scope = await getPrivateUsageScope();
	return <GeographyClient key={`${scope.userId}:${scope.workspaceId}`} scope={scope} />;
}

export default function GeographyPage() {
	return <Suspense fallback={<SettingsSectionFallback />}><GeographyContent /></Suspense>;
}
