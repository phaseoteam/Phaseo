"use client";
import { SettingsResourceQuery } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsPresetsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import PresetForm from "@/components/(gateway)/settings/presets/PresetForm";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { fetchFrontendAPIProviders, fetchFrontendModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";
type Props = { presetSlug?: string; models: Awaited<ReturnType<typeof fetchFrontendModels>>; providers: Awaited<ReturnType<typeof fetchFrontendAPIProviders>> };

export default function PresetEditorContent(props: Props) {
	return <SettingsResourceQuery resource="presets">{(initialData) => <PresetDetailContent {...props} initialData={initialData} />}</SettingsResourceQuery>;
}
function PresetDetailContent({ presetSlug, models, providers, initialData }: Props & { initialData: SettingsPresetsInitialData }) {
	const decodedSlug = presetSlug ? decodeURIComponent(presetSlug).trim().toLowerCase() : null;
	const preset = initialData.teamsWithPresets
		.flatMap((workspace) => workspace.presets)
		.find((candidate: any) => String(candidate.slug ?? "").toLowerCase() === decodedSlug);
	if (presetSlug && !preset) notFound();

	return (
		<div className="space-y-6">
			{preset ? <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
				<div className="flex min-w-0 items-center gap-3">
					<Button asChild variant="ghost" size="icon" className="rounded-md">
						<Link href="/settings/presets" aria-label="Back to Presets">
							<ArrowLeft className="h-4 w-4" />
						</Link>
					</Button>
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="truncate text-xl font-semibold">Edit Preset</h1>
							{preset.hasDraftChanges ? <Badge variant="secondary">Unpublished Changes</Badge> : null}
						</div>
						<p className="text-sm text-muted-foreground">Changes remain a draft until you publish a new version.</p>
					</div>
				</div>
				<ProductFeedbackButton surface="settings_preset_editor" prompt="Tell us what is missing or confusing about the Preset editor." />
			</div> : null}
			<PresetForm
				models={models}
				providers={providers}
				currentUserId={initialData.currentUserId}
				currentTeamId={initialData.initialTeamId}
				workspacePublisher={initialData.workspacePublisher}
				initialPreset={preset}
			/>
		</div>
	);
}
