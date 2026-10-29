"use client";
import { SettingsResourceQuery } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import PresetsPanel from "@/components/(gateway)/settings/presets/PresetsPanel";

export default function PresetsContent() {
	return <SettingsResourceQuery resource="presets">{(data) => <PresetsPanel
		teamsWithPresets={data.teamsWithPresets}
		currentUserId={data.currentUserId} workspacePublisherHandle={data.workspacePublisher.handle}
	/>}</SettingsResourceQuery>;
}
