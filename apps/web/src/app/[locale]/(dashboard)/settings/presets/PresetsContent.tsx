"use client";
import { SettingsResourceQuery } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import PresetsPanel from "@/components/(gateway)/settings/presets/PresetsPanel";
import type { fetchFrontendModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export default function PresetsContent({ models }: { models: Awaited<ReturnType<typeof fetchFrontendModels>> }) {
	return <SettingsResourceQuery resource="presets">{(data) => <PresetsPanel
		teamsWithPresets={data.teamsWithPresets.map((team) => ({ ...team, presets: team.presets.map((preset) => ({ ...preset, all_models: models })) }))}
		currentUserId={data.currentUserId} workspacePublisherHandle={data.workspacePublisher.handle}
	/>}</SettingsResourceQuery>;
}
