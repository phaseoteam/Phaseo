import { getLocale } from "@/i18n/server";
import { getBetaMessages } from "@/i18n/beta";
import type { PublicLocale } from "@/i18n/routing";
export async function getBetaMetadata() {
	return { title: getBetaMessages(await getLocale() as PublicLocale).title };
}
import { Suspense } from "react";
import { useSuspenseQueries } from "@tanstack/react-query";
import { settingsFlagQuery } from "../settings.functions";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import BetaContent from "./BetaContent";

export default function BetaSettingsPage() {
	return <Suspense fallback={<SettingsSectionFallback />}><BetaAvailability /></Suspense>;
}

function BetaAvailability() {
	// Availability is workspace-dependent and remains fresh; only profile preferences are cached.
	const [{ data: videoEnabled }, { data: batchEnabled }] = useSuspenseQueries({
		queries: [settingsFlagQuery("videoApi", { safe: true }), settingsFlagQuery("batchApi", { safe: true })],
	});
	return <BetaContent videoEnabled={videoEnabled} batchEnabled={batchEnabled} />;
}
