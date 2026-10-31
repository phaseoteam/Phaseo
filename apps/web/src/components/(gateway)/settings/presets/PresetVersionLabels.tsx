"use client";

// Purpose: Show a preset's published versions and the labels that point at them
// Why: Requests can pin "@slug@production"; moving the label changes what they
//      run, so choosing an earlier version for it is the rollback
// How: Loads versions (with each one's models and template) and labels from the
//      account API. Each label row has a version picker; each version row
//      expands to show its content, how it differs from the default version,
//      and a Run button that sends the template test values to that version.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Info, Loader2, Play, Plus, Tag, X } from "lucide-react";
import { useFormatter, useTranslations } from "@/i18n/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { CopyButton } from "@/components/ui/copy-button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
	listPresetVersionsAction,
	removePresetVersionLabelAction,
	setPresetVersionLabelAction,
	type PresetVersionSummary,
	type PresetVersionsWithLabels,
} from "@/app/(dashboard)/settings/presets/actions";
import { cn } from "@/lib/utils";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { buildPromptTemplate, draftFromTemplate, renderPromptPreview } from "./PresetPromptTemplateEditor";
import { TemplateRunResult, useTemplateRun } from "./PresetTemplateRun";
import { compareVersions, versionMessages, type LineChange } from "./presetVersionDiff";

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

/** The model ID that pins a label or version, such as "@support-triage@production". */
export function labelReference(reference: string, label: string): string {
	return `${reference}@${label}`;
}

/** The label change a version picker makes: null when the label already points there. */
export function labelMoveFor(
	label: string,
	versionId: string,
	data: Pick<PresetVersionsWithLabels, "labels" | "versions">,
): { label: string; version: PresetVersionSummary; from: string | null } | null {
	const current = data.labels.find((row) => row.label === label);
	if (current?.version_id === versionId) return null;
	const version = data.versions.find((candidate) => candidate.id === versionId);
	if (!version) return null;
	const previous = current ? data.versions.find((candidate) => candidate.id === current.version_id) : null;
	return { label, version, from: previous ? versionName(previous) : null };
}

/** "production → v2, staging → v3" for the overview row, at most `limit` labels. */
export function labelsSummary(data: Pick<PresetVersionsWithLabels, "labels" | "versions">, limit = 2): string {
	const names = new Map(data.versions.map((version) => [version.id, versionName(version)]));
	const shown = data.labels.slice(0, limit).map((row) => `${row.label} → ${names.get(row.version_id) ?? "?"}`);
	const hidden = data.labels.length - shown.length;
	return hidden > 0 ? `${shown.join(", ")} +${hidden}` : shown.join(", ");
}

export type PresetVersionsState = { status: "loading" } | { status: "failed" } | { status: "ready"; data: PresetVersionsWithLabels };

/** Versions and labels for the editor; `reload` after publishing or moving a label. */
export function usePresetVersions(presetId: string | null) {
	const [state, setState] = useState<PresetVersionsState>({ status: "loading" });
	const reload = useCallback(async () => {
		if (!presetId) return;
		try {
			setState({ status: "ready", data: await listPresetVersionsAction(presetId) });
		} catch {
			setState({ status: "failed" });
		}
	}, [presetId]);
	useEffect(() => {
		if (!presetId) return;
		let cancelled = false;
		listPresetVersionsAction(presetId).then(
			(data) => { if (!cancelled) setState({ status: "ready", data }); },
			() => { if (!cancelled) setState({ status: "failed" }); },
		);
		return () => { cancelled = true; };
	}, [presetId]);
	return { state, setState, reload };
}

type Notice = { tone: "success" | "error"; text: string } | null;

export function PresetVersionLabels({
	presetId,
	reference,
	versions,
	testValues,
}: {
	presetId: string;
	/** How requests reach the saved preset, such as "@support-triage"; null when it has none. */
	reference: string | null;
	versions: ReturnType<typeof usePresetVersions>;
	/** The raw test values from the Prompt template view, used by Run. */
	testValues: Record<string, string>;
}) {
	const t = useTranslations("SettingsUI");
	const write = useSettingsWrite();
	const { state, setState, reload } = versions;
	const [busy, setBusy] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);
	const [newLabel, setNewLabel] = useState("");
	const [newLabelVersion, setNewLabelVersion] = useState<string>("");
	const [removing, setRemoving] = useState<string | null>(null);
	// Inline status instead of toasts, which covered the rows they described.
	const [notice, setNotice] = useState<Notice>(null);
	const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
	function show(next: Notice) {
		if (noticeTimer.current) clearTimeout(noticeTimer.current);
		setNotice(next);
		if (next?.tone === "success") noticeTimer.current = setTimeout(() => setNotice(null), 6000);
	}

	function errorMessage(code: string) {
		if (code === "invalid_preset_label") return t("presetVersions.labelInvalid");
		if (code === "forbidden") return t("presetVersions.readOnly");
		if (code === "preset_version_not_found") return t("presetVersions.versionGone");
		return t("presetVersions.failed");
	}

	async function moveLabel(label: string, version: PresetVersionSummary) {
		setBusy(`label:${label}`);
		try {
			const result = await write(setPresetVersionLabelAction(presetId, label, version.id));
			if (!result.ok) {
				show({ tone: "error", text: errorMessage(result.error) });
				return false;
			}
			show({ tone: "success", text: t("presetVersions.moved", { label, version: versionName(version) }) });
			await reload();
			return true;
		} catch {
			show({ tone: "error", text: t("presetVersions.failed") });
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
				show({ tone: "error", text: errorMessage(result.error) });
				return;
			}
			show({ tone: "success", text: t("presetVersions.removed", { label }) });
			setRemoving(null);
			await reload();
		} catch {
			show({ tone: "error", text: t("presetVersions.failed") });
		} finally {
			setBusy(null);
		}
	}

	const data = state.status === "ready" ? state.data : null;
	const normalizedNewLabel = normalizeLabelInput(newLabel);
	const newLabelInvalid = newLabel.trim() !== "" && !normalizedNewLabel;
	const newLabelExists = Boolean(normalizedNewLabel && data?.labels.some((row) => row.label === normalizedNewLabel));

	function openAddLabel() {
		if (!data) return;
		setNewLabel("");
		setNewLabelVersion(data.activeVersionId && data.versions.some((version) => version.id === data.activeVersionId) ? data.activeVersionId : data.versions[0]?.id ?? "");
		setAdding(true);
	}

	async function submitNewLabel() {
		const version = data?.versions.find((candidate) => candidate.id === newLabelVersion);
		if (!version || !normalizedNewLabel) return;
		if (await moveLabel(normalizedNewLabel, version)) setAdding(false);
	}

	const defaultVersion = data?.versions.find((version) => version.id === data.activeVersionId) ?? null;

	return (
		<div className="space-y-8">
			{state.status === "loading" ? (
				<p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("presetVersions.loading")}</p>
			) : null}
			{state.status === "failed" ? (
				<Callout tone="critical" role="alert">
					{t("presetVersions.loadFailed")}{" "}
					<button type="button" className="underline underline-offset-2" onClick={() => { setState({ status: "loading" }); void reload(); }}>{t("presetVersions.retry")}</button>
				</Callout>
			) : null}

			{data && data.versions.length === 0 ? (
				<p className="border-y py-4 text-sm text-muted-foreground">{t("presetVersions.empty")}</p>
			) : null}

			{data && data.versions.length > 0 ? (
				<>
					<section className="space-y-3" aria-labelledby="preset-labels-title">
						<div className="flex flex-wrap items-end justify-between gap-3">
							<div>
								<h3 id="preset-labels-title" className="text-sm font-semibold">{t("presetVersions.labelsTitle")}</h3>
								<p className="mt-1 text-sm text-muted-foreground">{t("presetVersions.labelsDescription")} {t("presetVersions.propagation")}</p>
							</div>
							{data.canManageLabels ? (
								<Button type="button" variant="outline" size="sm" className="rounded-md" disabled={busy !== null} onClick={openAddLabel}>
									<Plus className="mr-2 h-4 w-4" />
									{t("presetVersions.addLabel")}
								</Button>
							) : null}
						</div>
						<div aria-live="polite" className="min-h-0">
							{notice ? (
								<p role={notice.tone === "error" ? "alert" : "status"} className={cn("text-sm", notice.tone === "error" ? "text-destructive" : "text-muted-foreground")}>{notice.text}</p>
							) : null}
						</div>
						{data.labels.length === 0 ? (
							<p className="text-sm text-muted-foreground">{t("presetVersions.labelsEmpty")}</p>
						) : (
							<div className="divide-y border-y">
								{data.labels.map((row) => {
									const version = data.versions.find((candidate) => candidate.id === row.version_id);
									const pinned = reference ? labelReference(reference, row.label) : null;
									return (
										<div key={row.label} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
											<span className="flex min-w-32 items-center gap-2 font-mono text-sm font-medium"><Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{row.label}</span>
											{data.canManageLabels ? (
												// The form makes every select full width, so the wrapper sets the width.
												<div className="w-36">
												<Select
													value={row.version_id}
													onValueChange={(versionId: string) => {
														const move = labelMoveFor(row.label, versionId, data);
														if (move) void moveLabel(move.label, move.version);
													}}
													disabled={busy !== null}
												>
													<SelectTrigger size="sm" className="rounded-md font-mono" aria-label={t("presetVersions.versionFor", { label: row.label })}>
														{busy === `label:${row.label}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
														<SelectValue>{version ? versionName(version) : "?"}</SelectValue>
													</SelectTrigger>
													<SelectContent className="rounded-md">
														{data.versions.map((candidate) => (
															<SelectItem key={candidate.id} value={candidate.id} className="font-mono">
																{versionName(candidate)}{candidate.id === data.activeVersionId ? ` · ${t("presetVersions.defaultBadge")}` : ""}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												</div>
											) : (
												<span className="font-mono text-sm text-muted-foreground">{version ? versionName(version) : "?"}</span>
											)}
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
						{!data.canManageLabels ? <p className="text-xs text-muted-foreground">{t("presetVersions.readOnly")}</p> : null}
					</section>

					<section className="space-y-3" aria-labelledby="preset-versions-list-title">
						<div>
							<h3 id="preset-versions-list-title" className="text-sm font-semibold">{t("presetVersions.versionsTitle")}</h3>
							<p className="mt-1 text-sm text-muted-foreground">{t("presetVersions.versionsDescription")}</p>
						</div>
						<div className="divide-y border-y">
							{data.versions.map((version) => (
								<VersionRow
									key={version.id}
									version={version}
									isDefault={version.id === data.activeVersionId}
									defaultVersion={defaultVersion}
									reference={reference}
									testValues={testValues}
								/>
							))}
						</div>
					</section>
				</>
			) : null}

			<Dialog open={adding} onOpenChange={(open) => { if (!open) setAdding(false); }}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("presetVersions.addLabelTitle")}</DialogTitle>
						<DialogDescription>{t("presetVersions.addLabelDescription")}</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="preset-new-label">{t("presetVersions.labelName")}</Label>
							<Input
								id="preset-new-label"
								value={newLabel}
								autoFocus
								className="font-mono"
								autoComplete="off"
								onChange={(event) => setNewLabel(event.target.value)}
								onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submitNewLabel(); } }}
								aria-invalid={newLabelInvalid}
								aria-describedby="preset-new-label-help"
							/>
							<p id="preset-new-label-help" className={newLabelInvalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
								{newLabelInvalid
									? t("presetVersions.labelInvalid")
									: newLabelExists
										? t("presetVersions.labelExists", { label: normalizedNewLabel ?? "" })
										: t("presetVersions.labelHelp")}
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="preset-new-label-version">{t("presetVersions.labelVersion")}</Label>
							<Select value={newLabelVersion} onValueChange={(value: string) => setNewLabelVersion(value)}>
								<SelectTrigger id="preset-new-label-version" className="w-full rounded-md font-mono">
									<SelectValue>{(() => { const version = data?.versions.find((candidate) => candidate.id === newLabelVersion); return version ? versionName(version) : ""; })()}</SelectValue>
								</SelectTrigger>
								<SelectContent className="rounded-md">
									{data?.versions.map((candidate) => (
										<SelectItem key={candidate.id} value={candidate.id} className="font-mono">
											{versionName(candidate)}{candidate.id === data.activeVersionId ? ` · ${t("presetVersions.defaultBadge")}` : ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" className="rounded-md" onClick={() => setAdding(false)}>{t("labels.cancel")}</Button>
						<Button type="button" className="rounded-md" disabled={!normalizedNewLabel || !newLabelVersion || busy !== null} onClick={() => void submitNewLabel()}>
							{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
							{t("presetVersions.saveLabel")}
						</Button>
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
		</div>
	);
}

/** The values Run sends to a version, typed by that version's template, or why it cannot run. */
export function versionRunInput(prompt: unknown, testValues: Record<string, string>):
	| { ok: true; variables: Record<string, unknown> }
	| { ok: false; reason: "no_template" | "values"; issue?: string } {
	if (!prompt || typeof prompt !== "object") return { ok: false, reason: "no_template" };
	const build = buildPromptTemplate(draftFromTemplate(prompt));
	if (!build.template) return { ok: false, reason: "no_template" };
	const preview = renderPromptPreview(build, testValues);
	return preview.ok ? { ok: true, variables: preview.values } : { ok: false, reason: "values", issue: preview.issues[0]?.message };
}

function DiffText({ lines }: { lines: LineChange[] }) {
	return (
		<pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-xs">
			{lines.map((line, index) => (
				<span
					key={index}
					className={cn(
						"block",
						line.kind === "added" && "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
						line.kind === "removed" && "bg-red-500/10 text-red-800 line-through decoration-red-500/40 dark:text-red-300",
					)}
				>
					<span aria-hidden="true" className="select-none pr-2 text-muted-foreground">{line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}</span>
					{line.text || " "}
				</span>
			))}
		</pre>
	);
}

function VersionRow({
	version,
	isDefault,
	defaultVersion,
	reference,
	testValues,
}: {
	version: PresetVersionSummary;
	isDefault: boolean;
	defaultVersion: PresetVersionSummary | null;
	reference: string | null;
	testValues: Record<string, string>;
}) {
	const t = useTranslations("SettingsUI");
	const format = useFormatter();
	const [open, setOpen] = useState(false);
	const { state: runState, run } = useTemplateRun();
	const name = versionName(version);
	const detailsId = `preset-version-${version.id}`;
	const content = version.config ?? null;
	const runInput = useMemo(() => versionRunInput(content?.prompt, testValues), [content?.prompt, testValues]);
	const comparison = useMemo(
		() => (!isDefault && defaultVersion?.config && content ? compareVersions(defaultVersion.config, content) : null),
		[isDefault, defaultVersion, content],
	);
	const messages = useMemo(() => versionMessages(content?.prompt), [content?.prompt]);
	const runBlocked = !reference
		? t("presetTemplate.runNeedsSave")
		: !runInput.ok
			? runInput.reason === "no_template"
				? t("presetVersions.runNoTemplate")
				: t("presetVersions.runNeedsValues", { issue: runInput.issue ?? "" })
			: null;

	function startRun() {
		if (!reference || !runInput.ok) {
			setOpen(true);
			return;
		}
		setOpen(true);
		void run(reference, runInput.variables, name);
	}

	return (
		<div className="py-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<button
					type="button"
					className="flex min-w-0 flex-1 items-start gap-2 rounded-md text-left"
					aria-expanded={open}
					aria-controls={detailsId}
					onClick={() => setOpen((value) => !value)}
				>
					<ChevronRight className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden="true" />
					<span className="min-w-0 space-y-1">
						<span className="flex flex-wrap items-center gap-2">
							<span className="font-mono text-sm font-medium">{name}</span>
							{version.labels.map((label) => <Badge key={label} variant="outline" className="font-mono">{label}</Badge>)}
						</span>
						<span className="block text-xs text-muted-foreground">
							{version.created_at ? t("presetVersions.publishedAt", { date: format.dateTime(new Date(version.created_at), { dateStyle: "medium", timeStyle: "short" }) }) : null}
							{version.release_notes ? ` · ${version.release_notes}` : null}
						</span>
					</span>
				</button>
				<div className="flex items-center gap-2">
					{isDefault ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<span tabIndex={0} className="inline-flex items-center gap-1 rounded-md">
									<Badge variant="secondary">{t("presetVersions.defaultBadge")}<Info className="h-3 w-3" aria-hidden="true" /></Badge>
									<span className="sr-only">{t("presetVersions.defaultHelp")}</span>
								</span>
							</TooltipTrigger>
							<TooltipContent side="top">{t("presetVersions.defaultHelp")}</TooltipContent>
						</Tooltip>
					) : null}
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="rounded-md"
						onClick={startRun}
						disabled={runState.status === "running"}
						aria-label={t("presetVersions.runVersion", { version: name })}
					>
						{runState.status === "running" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
						{runState.status === "running" ? t("presetTemplate.running") : t("presetVersions.run")}
					</Button>
				</div>
			</div>

			{open ? (
				<div id={detailsId} className="mt-3 space-y-4 pl-6">
					{runBlocked ? (
						<p className="text-xs text-muted-foreground">{runBlocked}</p>
					) : (
						<p className="text-xs text-muted-foreground">{t("presetVersions.runHelp", { reference: labelReference(reference ?? "", name) })}</p>
					)}
					<TemplateRunResult state={runState} />

					{!content ? (
						<p className="text-sm text-muted-foreground">{t("presetVersions.contentUnavailable")}</p>
					) : (
						<>
							<div className="space-y-1">
								<div className="text-xs font-medium text-muted-foreground">{t("presetVersions.modelsTitle")}</div>
								{content.models.length ? (
									<ol className="space-y-0.5 font-mono text-sm">
										{content.models.map((model, index) => (
											<li key={model} className="flex items-center gap-2">
												<span className="w-4 text-right text-xs text-muted-foreground">{index + 1}</span>
												<span className="truncate">{model}</span>
												{comparison?.models.added.includes(model) ? <Badge variant="outline" className="text-emerald-700 dark:text-emerald-300">{t("presetVersions.modelAdded")}</Badge> : null}
											</li>
										))}
									</ol>
								) : (
									<p className="text-sm text-muted-foreground">{t("presetVersions.noModels")}</p>
								)}
								{comparison?.models.removed.length ? (
									<p className="text-xs text-muted-foreground">{t("presetVersions.modelsRemoved", { models: comparison.models.removed.join(", ") })}</p>
								) : null}
								{comparison?.models.reordered ? <p className="text-xs text-muted-foreground">{t("presetVersions.modelsReordered")}</p> : null}
							</div>

							<div className="space-y-2">
								<div className="text-xs font-medium text-muted-foreground">{t("presetVersions.messagesTitle")}</div>
								{comparison ? (
									comparison.messages.length ? comparison.messages.map((message) => (
										<div key={message.index} className="space-y-1">
											<div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
												<span>{message.role}</span>
												{message.status === "added" ? <span className="text-emerald-700 dark:text-emerald-300">{t("presetVersions.messageAdded")}</span> : null}
												{message.status === "removed" ? <span className="text-red-700 dark:text-red-300">{t("presetVersions.messageRemoved")}</span> : null}
												{message.status === "changed" ? <span>{t("presetVersions.messageChanged")}</span> : null}
												{message.previousRole ? <span>{t("presetVersions.roleChanged", { role: message.previousRole })}</span> : null}
											</div>
											<DiffText lines={message.lines} />
										</div>
									)) : <p className="text-sm text-muted-foreground">{t("presetVersions.noTemplate")}</p>
								) : messages.length ? (
									messages.map((message, index) => (
										<div key={index} className="space-y-1">
											<div className="font-mono text-xs text-muted-foreground">{message.role}</div>
											<pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-xs">{message.text}</pre>
										</div>
									))
								) : (
									<p className="text-sm text-muted-foreground">{t("presetVersions.noTemplate")}</p>
								)}
							</div>

							{isDefault ? (
								<p className="text-xs text-muted-foreground">{t("presetVersions.isDefault")}</p>
							) : comparison && defaultVersion ? (
								<p className="text-xs text-muted-foreground">
									{comparison.identical
										? t("presetVersions.sameAsDefault", { version: versionName(defaultVersion) })
										: t("presetVersions.comparedWithDefault", { version: versionName(defaultVersion) })}
									{comparison.otherTemplateChanged ? ` ${t("presetVersions.otherTemplateChanged")}` : ""}
									{" "}{t("presetVersions.compareScope")}
								</p>
							) : null}
						</>
					)}
				</div>
			) : null}
		</div>
	);
}
