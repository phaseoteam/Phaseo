"use client";

// Purpose: Show a preset's published versions and the labels that point at them
// Why: Requests can pin "@slug@production"; moving the label changes what they
//      run, so moving it back to an earlier version is the rollback
// How: Loads versions and labels from the account API, and moves or removes a
//      label with one action each

import React, { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Loader2, Plus, Tag, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { CopyButton } from "@/components/ui/copy-button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	listPresetVersionsAction,
	removePresetVersionLabelAction,
	setPresetVersionLabelAction,
	type PresetVersionSummary,
	type PresetVersionsWithLabels,
} from "@/app/(dashboard)/settings/presets/actions";
import { useSettingsWrite } from "../PrivateSettingsQuery";

const LABEL_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

/** The label as stored (lowercase), or null when the database would refuse it. */
export function normalizeLabelInput(value: string): string | null {
	const label = value.trim().toLowerCase();
	return LABEL_PATTERN.test(label) && !/^v[0-9]+$/.test(label) ? label : null;
}

/** How a version is named in requests: its version label, or v{number}. */
export function versionName(version: Pick<PresetVersionSummary, "version_label" | "version_number">): string {
	return version.version_label || `v${version.version_number}`;
}

/** The model ID that pins a label, such as "@support-triage@production". */
export function labelReference(reference: string, label: string): string {
	return `${reference}@${label}`;
}

/** Labels that point somewhere else, with the version each points at now: the one-step moves for this version. */
export function labelMovesFor(versionId: string, data: Pick<PresetVersionsWithLabels, "labels" | "versions">) {
	const names = new Map(data.versions.map((version) => [version.id, versionName(version)]));
	return data.labels
		.filter((row) => row.version_id !== versionId)
		.map((row) => ({ label: row.label, from: names.get(row.version_id) ?? null }));
}

type LoadState = { status: "loading" } | { status: "failed" } | { status: "ready"; data: PresetVersionsWithLabels };

export function PresetVersionLabels({ presetId, reference }: { presetId: string; reference: string | null }) {
	const t = useTranslations("SettingsUI");
	const format = useFormatter();
	const write = useSettingsWrite();
	const [state, setState] = useState<LoadState>({ status: "loading" });
	const [busy, setBusy] = useState<string | null>(null);
	const [newLabelFor, setNewLabelFor] = useState<PresetVersionSummary | null>(null);
	const [newLabel, setNewLabel] = useState("");
	const [removing, setRemoving] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			setState({ status: "ready", data: await listPresetVersionsAction(presetId) });
		} catch {
			setState({ status: "failed" });
		}
	}, [presetId]);
	useEffect(() => {
		let cancelled = false;
		listPresetVersionsAction(presetId).then(
			(data) => { if (!cancelled) setState({ status: "ready", data }); },
			() => { if (!cancelled) setState({ status: "failed" }); },
		);
		return () => { cancelled = true; };
	}, [presetId]);

	function errorMessage(code: string) {
		if (code === "invalid_preset_label") return t("presetVersions.labelInvalid");
		if (code === "forbidden") return t("presetVersions.readOnly");
		if (code === "preset_version_not_found") return t("presetVersions.versionGone");
		return t("presetVersions.failed");
	}

	async function moveLabel(label: string, version: PresetVersionSummary) {
		setBusy(`${label}:${version.id}`);
		try {
			const result = await write(setPresetVersionLabelAction(presetId, label, version.id));
			if (!result.ok) {
				toast.error(errorMessage(result.error));
				return false;
			}
			toast.success(t("presetVersions.moved", { label, version: versionName(version) }));
			await load();
			return true;
		} catch {
			toast.error(t("presetVersions.failed"));
			return false;
		} finally {
			setBusy(null);
		}
	}

	async function removeLabel(label: string) {
		setBusy(`remove:${label}`);
		try {
			const result = await write(removePresetVersionLabelAction(presetId, label));
			if (!result.ok && result.error !== "label_not_found") {
				toast.error(errorMessage(result.error));
				return;
			}
			toast.success(t("presetVersions.removed", { label }));
			setRemoving(null);
			await load();
		} catch {
			toast.error(t("presetVersions.failed"));
		} finally {
			setBusy(null);
		}
	}

	const normalizedNewLabel = normalizeLabelInput(newLabel);
	async function submitNewLabel() {
		if (!newLabelFor || !normalizedNewLabel) return;
		if (await moveLabel(normalizedNewLabel, newLabelFor)) {
			setNewLabelFor(null);
			setNewLabel("");
		}
	}

	const data = state.status === "ready" ? state.data : null;
	const exampleLabel = data?.labels[0]?.label ?? "production";

	return (
		<section className="space-y-4" aria-labelledby="preset-versions-title">
			<div>
				<h2 id="preset-versions-title" className="text-sm font-semibold">{t("presetVersions.title")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("presetVersions.description")}</p>
			</div>

			{state.status === "loading" ? (
				<p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("presetVersions.loading")}</p>
			) : null}
			{state.status === "failed" ? (
				<Callout tone="critical" role="alert">
					{t("presetVersions.loadFailed")}{" "}
					<button type="button" className="underline underline-offset-2" onClick={() => { setState({ status: "loading" }); void load(); }}>{t("presetVersions.retry")}</button>
				</Callout>
			) : null}

			{data && data.versions.length === 0 ? (
				<p className="border-y py-4 text-sm text-muted-foreground">{t("presetVersions.empty")}</p>
			) : null}

			{data && data.versions.length > 0 ? (
				<>
					<div className="space-y-2">
						<div className="text-sm font-medium">{t("presetVersions.labelsTitle")}</div>
						{data.labels.length === 0 ? (
							<p className="text-sm text-muted-foreground">{t("presetVersions.labelsEmpty")}</p>
						) : (
							<div className="divide-y border-y">
								{data.labels.map((row) => {
									const version = data.versions.find((candidate) => candidate.id === row.version_id);
									const pinned = reference ? labelReference(reference, row.label) : null;
									return (
										<div key={row.label} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
											<span className="flex min-w-32 items-center gap-2 font-mono text-sm font-medium"><Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{row.label}</span>
											<span className="text-sm text-muted-foreground">{t("presetVersions.pointsAt", { version: version ? versionName(version) : "?" })}</span>
											{pinned ? (
												<span className="flex min-w-0 items-center gap-1">
													<code className="truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">{pinned}</code>
													<CopyButton content={pinned} variant="ghost" size="sm" className="rounded-md" aria-label={t("presetVersions.copyReference", { reference: pinned })} />
												</span>
											) : null}
											{data.canManageLabels ? (
												<Button type="button" variant="ghost" size="sm" className="ml-auto rounded-md text-muted-foreground" disabled={busy !== null} onClick={() => setRemoving(row.label)} aria-label={t("presetVersions.removeLabel", { label: row.label })}>
													<X className="h-4 w-4" />
												</Button>
											) : null}
										</div>
									);
								})}
							</div>
						)}
					</div>

					<div className="space-y-2">
						<div className="text-sm font-medium">{t("presetVersions.versionsTitle")}</div>
						<div className="divide-y border-y">
							{data.versions.map((version) => {
								const moves = labelMovesFor(version.id, data);
								return (
									<div key={version.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
										<div className="min-w-0 space-y-1">
											<div className="flex flex-wrap items-center gap-2">
												<span className="font-mono text-sm font-medium">{versionName(version)}</span>
												{version.id === data.activeVersionId ? <Badge variant="secondary">{t("presetVersions.current")}</Badge> : null}
												{version.labels.map((label) => <Badge key={label} variant="outline" className="font-mono">{label}</Badge>)}
											</div>
											<p className="text-xs text-muted-foreground">
												{version.created_at ? t("presetVersions.publishedAt", { date: format.dateTime(new Date(version.created_at), { dateStyle: "medium", timeStyle: "short" }) }) : null}
												{version.release_notes ? ` · ${version.release_notes}` : null}
											</p>
										</div>
										{data.canManageLabels ? (
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button type="button" variant="outline" size="sm" className="rounded-md" disabled={busy !== null}>
														{busy?.endsWith(`:${version.id}`) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRightLeft className="mr-2 h-4 w-4" />}
														{t("presetVersions.pointLabel")}
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end" className="min-w-64 rounded-md">
													{moves.map((move) => (
														<DropdownMenuItem key={move.label} onClick={() => void moveLabel(move.label, version)}>
															<ArrowRightLeft className="mr-2 h-4 w-4" />
															{move.from ? t("presetVersions.moveLabelHere", { label: move.label, from: move.from }) : t("presetVersions.moveLabelHereUnknown", { label: move.label })}
														</DropdownMenuItem>
													))}
													{moves.length ? <DropdownMenuSeparator /> : null}
													<DropdownMenuItem onClick={() => { setNewLabel(data.labels.some((row) => row.label === "production") ? "" : "production"); setNewLabelFor(version); }}>
														<Plus className="mr-2 h-4 w-4" />
														{t("presetVersions.newLabel")}
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										) : null}
									</div>
								);
							})}
						</div>
					</div>

					{!data.canManageLabels ? <p className="text-xs text-muted-foreground">{t("presetVersions.readOnly")}</p> : null}
					<Callout tone="info">
						{reference
							? t("presetVersions.usage", { reference: labelReference(reference, exampleLabel), label: exampleLabel })
							: t("presetVersions.usageNoReference", { label: exampleLabel })}
						{" "}{t("presetVersions.propagation")}
					</Callout>
				</>
			) : null}

			<Dialog open={newLabelFor !== null} onOpenChange={(open) => { if (!open) setNewLabelFor(null); }}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("presetVersions.newLabelTitle", { version: newLabelFor ? versionName(newLabelFor) : "" })}</DialogTitle>
						<DialogDescription>{t("presetVersions.newLabelDescription")}</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="preset-new-label">{t("presetVersions.labelName")}</Label>
						<Input
							id="preset-new-label"
							value={newLabel}
							autoFocus
							className="font-mono"
							placeholder="production"
							onChange={(event) => setNewLabel(event.target.value)}
							onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submitNewLabel(); } }}
							aria-invalid={newLabel.trim() !== "" && !normalizedNewLabel}
						/>
						<p className={newLabel.trim() !== "" && !normalizedNewLabel ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
							{newLabel.trim() !== "" && !normalizedNewLabel ? t("presetVersions.labelInvalid") : data?.labels.some((row) => row.label === normalizedNewLabel) ? t("presetVersions.labelExists", { label: normalizedNewLabel ?? "" }) : t("presetVersions.labelHelp")}
						</p>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" className="rounded-md" onClick={() => setNewLabelFor(null)}>{t("labels.cancel")}</Button>
						<Button type="button" className="rounded-md" disabled={!normalizedNewLabel || busy !== null} onClick={() => void submitNewLabel()}>{t("presetVersions.saveLabel")}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("presetVersions.removeTitle", { label: removing ?? "" })}</DialogTitle>
						<DialogDescription>{t("presetVersions.removeDescription", { reference: reference && removing ? labelReference(reference, removing) : removing ?? "" })}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" className="rounded-md" onClick={() => setRemoving(null)}>{t("labels.cancel")}</Button>
						<Button type="button" variant="destructive" className="rounded-md" disabled={busy !== null} onClick={() => removing && void removeLabel(removing)}>{t("presetVersions.removeConfirm")}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}
