import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { getPrivateUsageScope } from "@/lib/fetchers/internal/getPrivateUsageScope";
import GeographyClient from "./GeographyClient";

export const metadata = { title: "Geography - Settings" };

async function GeographyContent() {
	const scope = await getPrivateUsageScope();
	return <GeographyClient key={`${scope.userId}:${scope.workspaceId}`} scope={scope} />;
}

export default function GeographyPage() {
	return <Suspense fallback={<SettingsSectionFallback />}><GeographyContent /></Suspense>;
}
