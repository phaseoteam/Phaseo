import { getLocale } from "next-intl/server";
import { getBetaMessages } from "@/i18n/beta";
import type { PublicLocale } from "@/i18n/routing";
export async function generateMetadata() {
	return { title: getBetaMessages(await getLocale() as PublicLocale).title };
}
import { Suspense } from "react";
import { batchApiFlag, videoApiFlag } from "@/lib/flags";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import BetaContent from "./BetaContent";

export default function BetaSettingsPage() {
	return <Suspense fallback={<SettingsSectionFallback />}><BetaAvailability /></Suspense>;
}

async function BetaAvailability() {
	// Availability is workspace-dependent and remains fresh; only profile preferences are cached.
	const [videoEnabled, batchEnabled] = await Promise.all([
		videoApiFlag().catch(() => false), batchApiFlag().catch(() => false),
	]);
	return <BetaContent videoEnabled={videoEnabled} batchEnabled={batchEnabled} />;
}
