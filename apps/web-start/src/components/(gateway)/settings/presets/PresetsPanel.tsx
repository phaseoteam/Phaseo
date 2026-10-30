"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { MoreVertical, Copy, AtSign, Edit2, GitBranch, Trash2, Upload } from "lucide-react";
import DeletePresetItem from "./DeletePresetItem";
import { toast } from "sonner";
import { applyPresetUpstreamVersionAction, publishPresetVersionAction } from "@/app/(dashboard)/settings/presets/actions";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";

interface PresetsPanelProps {
	teamsWithPresets: any[];
	currentUserId?: string | null;
	workspacePublisherHandle?: string | null;
}

export default function PresetsPanel({
	teamsWithPresets,
	currentUserId,
	workspacePublisherHandle,
}: PresetsPanelProps) {
	const t = useTranslations("SettingsUI");
	const [publishingPresetId, setPublishingPresetId] = useState<string | null>(null);
	const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);
	const sortedTeams = useMemo(() => {
		if (!Array.isArray(teamsWithPresets)) return teamsWithPresets;
		const withPresets: any[] = [];
		const withoutPresets: any[] = [];
		for (const t of teamsWithPresets) {
			if (t && Array.isArray(t.presets) && t.presets.length > 0)
				withPresets.push(t);
			else withoutPresets.push(t);
		}
		return [...withPresets, ...withoutPresets];
	}, [teamsWithPresets]);

	function onCopyPresetReference(preset: any) {
		const slug = String(preset.slug ?? preset.name ?? "").replace(/^@+/, "");
		const reference = preset.visibility === "public" && workspacePublisherHandle ? `@${workspacePublisherHandle}/${slug}` : `@${slug}`;
		navigator.clipboard.writeText(reference);
		toast.success(t("strings.Preset reference copied" as never), { duration: 2000 });
	}

	async function onPublishVersion(preset: any) {
		if (publishingPresetId) return;
		const releaseNotes = window.prompt(t("strings.What changed in this version? (optional)" as never)) ?? undefined;
		const versionLabel = preset.versioning_method === "semver" ? window.prompt(t("strings.phraseSemanticVersionForExample120Or200Beta1" as never)) ?? undefined : undefined;
		if (preset.versioning_method === "semver" && !versionLabel) return;
		setPublishingPresetId(preset.id);
		try { const result = await publishPresetVersionAction(preset.id, releaseNotes, versionLabel); toast.success(`${t("credits.Published" as never)} ${result.version?.version_label ?? `${t("credits.release" as never)} ${result.version?.version_number ?? t("credits.next" as never)}`}`); window.location.reload(); }
		catch (error) { toast.error(localizedSettingsError(error, t, "Failed to publish version")); setPublishingPresetId(null); }
	}

	async function onApplyUpstream(id: string, versionId: string, versionNumber: number) {
		try { await applyPresetUpstreamVersionAction(id, versionId); toast.success(`${t("credits.Upstream" as never)} v${versionNumber} ${t("credits.applied to your draft" as never)}`); window.location.reload(); }
		catch (error) { toast.error(localizedSettingsError(error, t, "Failed to apply upstream update")); }
	}

	if (!sortedTeams || sortedTeams.length === 0) {
		return (
			<Empty className="mt-6 rounded-xl border border-dashed border-border/80 p-8">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<AtSign className="h-5 w-5" />
					</EmptyMedia>
					<EmptyTitle>{t("strings.No presets yet" as never)}</EmptyTitle>
					<EmptyDescription>
						{t("strings.phraseCreateAPresetToReuseModelProviderAndPromptConfiguration" as never)}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="mt-6 space-y-6">
			{sortedTeams.map((team: any) => (
				<div key={team.id ?? "personal"}>
					<div className="font-medium mb-2">{team.name}</div>
					{!team.presets || team.presets.length === 0 ? (
						<Empty
							size="compact"
							className="rounded-lg border border-dashed border-border/80 p-6"
						>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<AtSign className="h-5 w-5" />
								</EmptyMedia>
					<EmptyTitle className="text-base">{t("strings.No presets for this workspace" as never)}</EmptyTitle>
								<EmptyDescription>
									{t("strings.phraseCreateOneToStandardizeRequestSettingsAcrossApps" as never)}
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<div className="overflow-hidden rounded-xl border border-border/70">
							{team.presets.map((p: any) => (
								<div
									key={p.id}
									className="relative border-b border-border/70 px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/20"
								>
								<div className="flex items-center justify-between gap-4">
										<div className="min-w-0 flex-1">
											<div className="min-w-0 flex-1">
												<div className="font-medium flex items-center gap-2 mb-1">
													<span className="truncate">{p.name}</span>
													{p.visibility && (
														<Badge variant="outline" className="text-[10px] capitalize">
										{p.visibility === "private" ? t("credits.Only Me" as never) : p.visibility === "team" ? t("credits.Share With Workspace" as never) : p.visibility === "public" ? t("strings.Public" as never) : p.visibility}
														</Badge>
													)}
													{p.source_preset_id && (
														<Badge variant="secondary" className="text-[10px] capitalize">
											{t("presetPage.fork" as never)}
														</Badge>
													)}
													{p.hasDraftChanges && (
														<Badge variant="secondary" className="text-[10px]">
											{t("settingsPageCopy.unpublished" as never)}
														</Badge>
													)}
												</div>
												{p.slug && (
													<p className="mt-1 text-xs text-muted-foreground">
														{t("strings.Invoke with" as never)} <span className="font-mono">{p.visibility === "public" && workspacePublisherHandle ? `@${workspacePublisherHandle}/${p.slug}` : `@${p.slug}`}</span>
													</p>
												)}
											</div>
										</div>
										<div className="ml-2 flex-shrink-0">
											<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
														variant="ghost"
														size="icon"
									aria-label={t("labels.actions")}
													className="h-8 w-8"
												>

													<MoreVertical className="h-4 w-4" />
												</Button>

												</DropdownMenuTrigger>
												<DropdownMenuContent
													side="bottom"
													align="end"
													className="min-w-56 rounded-md"
												>
													<DropdownMenuItem onClick={() => onCopyPresetReference(p)}>

															<Copy className="mr-2 h-4 w-4" />
															{t("presetPage.copyReference" as never)}

													</DropdownMenuItem>
													<DropdownMenuItem asChild>
														<Link href={`/settings/presets/${encodeURIComponent(p.slug)}`}>
															<Edit2 className="mr-2 h-4 w-4" />
																{t("strings.Edit" as never)}
														</Link>
													</DropdownMenuItem>
									{p.canPublish && p.hasDraftChanges && <DropdownMenuItem disabled={publishingPresetId === p.id} onClick={() => onPublishVersion(p)}><Upload className="mr-2 h-4 w-4" />{publishingPresetId === p.id ? t("strings.Publishing…" as never) : t("strings.Publish new version" as never)}</DropdownMenuItem>}
									{p.created_by === currentUserId && p.hasUpstreamUpdate && p.latestUpstreamVersion && <DropdownMenuItem onClick={() => onApplyUpstream(p.id, p.latestUpstreamVersion.id, p.latestUpstreamVersion.version_number)}><GitBranch className="mr-2 h-4 w-4" />{t("credits.Apply upstream" as never)} v{p.latestUpstreamVersion.version_number} {t("credits.to draft" as never)}</DropdownMenuItem>}
													<DropdownMenuItem variant="destructive" onClick={() => setDeletingPresetId(p.id)}>
														<Trash2 className="mr-2 h-4 w-4" />
																{t("strings.Delete" as never)}
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
											<DeletePresetItem
												p={p}
												open={deletingPresetId === p.id}
												onOpenChange={(open: boolean) => setDeletingPresetId(open ? p.id : null)}
												showTrigger={false}
											/>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			))}
		</div>
	);
}
