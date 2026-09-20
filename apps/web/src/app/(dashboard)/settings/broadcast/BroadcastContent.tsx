"use client";
import { withPrivateSettings } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsBroadcastInitialData } from "@/lib/fetchers/internal/settingsTypes";
import BroadcastSettingsClient from "@/components/(gateway)/settings/observability/BroadcastSettingsClient";
export default withPrivateSettings("/api/account/settings/broadcast", function BroadcastContent({ initialData }: { initialData: SettingsBroadcastInitialData }) {
	return <BroadcastSettingsClient teamName={initialData.teamName} configuredDestinations={initialData.configuredDestinations} />;
});
