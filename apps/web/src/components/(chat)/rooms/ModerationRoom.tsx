"use client";

import { useEffect, useMemo, useState } from "react";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import { APP_HEADERS } from "@/components/(chat)/playground/chat-playground-core";
import {
	buildModerationInput,
	normalizeModerationResult,
	type NormalizedModerationResult,
} from "@/lib/chat/roomRequestBuilders";
import {
	listRoomHistory,
	upsertRoomHistory,
	type NonTextRoomId,
} from "@/lib/indexeddb/chatRoomHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RoomModelSelector } from "@/components/(chat)/RoomModelSelector";
import { useSidebar } from "@/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRoomModelSettings } from "@/components/(chat)/rooms/useRoomModelSettings";
import {
	getDefaultModerationRoomParams,
	getModerationThreshold,
	type ModerationRoomParams,
} from "@/lib/chat/roomModelSettings";
import { ModerationModelSettingsDialog } from "@/components/(chat)/rooms/settings/ModerationModelSettingsDialog";
import { ChevronRight } from "lucide-react";

type ModerationHistoryPayload = {
	modelId: string;
	text: string;
	imageUrls: string[];
	scoreThreshold: number;
	result: NormalizedModerationResult | null;
	raw: unknown;
};

type ModerationEntry = {
	id: string;
	createdAt: string;
	modelId: string;
	text: string;
	imageUrls: string[];
	scoreThreshold: number;
	result: NormalizedModerationResult | null;
	raw: unknown;
};

function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
		reader.onload = () => resolve(String(reader.result ?? ""));
		reader.readAsDataURL(file);
	});
}

function nowIso() {
	return new Date().toISOString();
}

function toEntry(record: {
	id: string;
	createdAt: string;
	payload: ModerationHistoryPayload;
}): ModerationEntry {
	return {
		id: record.id,
		createdAt: record.createdAt,
		modelId: record.payload.modelId,
		text: record.payload.text,
		imageUrls: record.payload.imageUrls,
		scoreThreshold: record.payload.scoreThreshold,
		result: record.payload.result,
		raw: record.payload.raw,
	};
}

function isEntryFlagged(entry: ModerationEntry) {
	if (entry.result?.flagged) return true;
	const threshold = Math.max(0, Math.min(1, entry.scoreThreshold || 0.5));
	const scores = Object.values(entry.result?.categoryScores ?? {});
	return scores.some((score) => Number(score) >= threshold);
}

export function ModerationRoom({ models }: { models: GatewaySupportedModel[] }) {
	const { toggleSidebar, state: sidebarState } = useSidebar();
	const filteredModels = useMemo(
		() =>
			filterModelsForRoom(models, "moderation").filter(
				(model) => model.isAvailable,
			),
		[models],
	);
	const [modelId, setModelId] = useState(filteredModels[0]?.modelId ?? "");
	const [text, setText] = useState("");
	const [imageUrl, setImageUrl] = useState("");
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [entries, setEntries] = useState<ModerationEntry[]>([]);
	const modelSettings = useRoomModelSettings({
		roomId: "moderation",
		models: filteredModels,
		selectedModelId: modelId,
		onModelChange: setModelId,
		getDefaultParams: () => getDefaultModerationRoomParams(),
	});
	const modelSettingsCompat = modelSettings as any;
	const selectedProfile =
		modelSettingsCompat.selectedProfile ?? modelSettingsCompat.activeModelSettings ?? null;
	const selectedModelEnabled = selectedProfile?.enabled !== false;
	const selectedProviderId = selectedProfile?.providerId;
	const dialogModelId: string | null = modelSettingsCompat.modelSettingsModelId ?? null;
	const dialogProfile =
		dialogModelId && typeof modelSettingsCompat.getProfileForModel === "function"
			? modelSettingsCompat.getProfileForModel(dialogModelId)
			: dialogModelId === modelId
				? selectedProfile
				: null;
	const updateModelBaseSettings = (partial: Record<string, unknown>) => {
		if (typeof modelSettingsCompat.updateModelBaseSettings === "function") {
			modelSettingsCompat.updateModelBaseSettings(partial);
			return;
		}
		if (typeof modelSettingsCompat.updateModelSettings === "function") {
			modelSettingsCompat.updateModelSettings(partial);
		}
	};
	const updateModelParams = (partial: Record<string, unknown>) => {
		if (typeof modelSettingsCompat.updateModelParams === "function") {
			modelSettingsCompat.updateModelParams(partial);
		}
	};
	const resetModelSettings = () => {
		if (typeof modelSettingsCompat.resetModelSettings === "function") {
			modelSettingsCompat.resetModelSettings();
		}
	};

	useEffect(() => {
		setModelId((current) => {
			if (current && filteredModels.some((model) => model.modelId === current)) {
				return current;
			}
			return filteredModels[0]?.modelId ?? "";
		});
	}, [filteredModels]);

	useEffect(() => {
		let mounted = true;
		void listRoomHistory<ModerationHistoryPayload>(
			"moderation" as NonTextRoomId,
		).then((records) => {
			if (!mounted) return;
			setEntries(records.map((record) => toEntry(record)));
		});
		return () => {
			mounted = false;
		};
	}, []);

	const submit = async () => {
		if (isLoading || !modelId || !selectedModelEnabled) return;
		if (!text.trim() && !imageUrl.trim() && !imageFile) return;
		setError(null);
		setIsLoading(true);
		try {
			const imageUrls: string[] = [];
			if (imageUrl.trim()) imageUrls.push(imageUrl.trim());
			if (imageFile) {
				const dataUrl = await fileToDataUrl(imageFile);
				imageUrls.push(dataUrl);
			}
			const input = buildModerationInput({
				text,
				imageUrls,
			});

			const response = await fetch("/api/chat/moderation", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					requestBody: {
						model: modelId,
						...(selectedProviderId &&
						selectedProviderId !== "auto"
							? {
									provider: {
										only: [selectedProviderId],
									},
								}
							: {}),
						input,
					},
					appHeaders: APP_HEADERS,
				}),
			});
			if (!response.ok) {
				const body = await response.text();
				throw new Error(body || `Request failed (${response.status})`);
			}
			const payload = await response.json();
			const normalized = normalizeModerationResult(payload);
			const scoreThreshold = getModerationThreshold(
				(selectedProfile?.params as ModerationRoomParams) ??
					getDefaultModerationRoomParams(),
			);
			const entry: ModerationEntry = {
				id: crypto.randomUUID(),
				createdAt: nowIso(),
				modelId,
				text: text.trim(),
				imageUrls,
				scoreThreshold,
				result: normalized,
				raw: payload,
			};
			setEntries((prev) => [entry, ...prev]);
			await upsertRoomHistory<ModerationHistoryPayload>({
				id: entry.id,
				roomId: "moderation",
				createdAt: entry.createdAt,
				updatedAt: entry.createdAt,
				payload: {
					modelId: entry.modelId,
					text: entry.text,
					imageUrls: entry.imageUrls,
					scoreThreshold: entry.scoreThreshold,
					result: entry.result,
					raw: entry.raw,
				},
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Moderation failed");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<header className="mt-1 flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-3 md:px-5">
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="group -ml-1 h-8 w-8"
								onClick={toggleSidebar}
							>
								<ChevronRight
									className={`h-4 w-4 transition-transform duration-200 ${
										sidebarState === "expanded"
											? "rotate-180 group-hover:-translate-x-1"
											: "group-hover:translate-x-1"
									}`}
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Toggle sidebar</TooltipContent>
					</Tooltip>
						<RoomModelSelector
							models={filteredModels}
							selectedModelIds={modelId ? [modelId] : []}
							onSelectModel={setModelId}
							modelDisplayNameById={modelSettings.modelDisplayNameById}
							modelEnabledById={modelSettings.modelEnabledById}
							onOpenModelSettingsForModel={modelSettings.openModelSettingsForModel}
						/>
					</div>
					<Badge variant="secondary">{entries.length} checks</Badge>
				</header>

			<main className="min-h-0 flex-1 overflow-auto px-4 py-5 md:px-6">
				<div className="grid gap-3">
					{entries.map((entry) => (
						<div
							key={entry.id}
							className="rounded-xl border border-border bg-card p-4"
						>
							<div className="mb-3 flex items-center justify-between">
								<div className="text-xs text-muted-foreground">
									{new Date(entry.createdAt).toLocaleTimeString()}
								</div>
								<span
									className={`rounded-full px-2 py-1 text-xs font-medium ${
										isEntryFlagged(entry)
											? "bg-destructive/10 text-destructive"
											: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
									}`}
								>
									{isEntryFlagged(entry) ? "Flagged" : "Not flagged"}
								</span>
							</div>
							{entry.text ? (
								<p className="mb-2 text-sm text-foreground">{entry.text}</p>
							) : null}
							{entry.imageUrls[0] ? (
								<img
									src={entry.imageUrls[0]}
									alt="Moderation input"
									className="mb-2 max-h-40 rounded-md border border-border object-cover"
								/>
							) : null}
							{entry.result ? (
								<div className="grid gap-2 md:grid-cols-2">
									<div className="space-y-1">
										<p className="text-xs font-semibold uppercase text-muted-foreground">
											Categories
										</p>
										{Object.entries(entry.result.categories).map(
											([category, flagged]) => (
												<div
													key={category}
													className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs"
												>
													<span>{category}</span>
													<span>{flagged ? "true" : "false"}</span>
												</div>
											),
										)}
									</div>
									<div className="space-y-1">
										<p className="text-xs font-semibold uppercase text-muted-foreground">
											Scores
										</p>
										{Object.entries(entry.result.categoryScores).map(
											([category, score]) => (
												<div
													key={category}
													className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs"
												>
													<span>{category}</span>
													<span>{Number(score).toFixed(6)}</span>
												</div>
											),
										)}
									</div>
								</div>
							) : null}
							<details className="mt-2">
								<summary className="cursor-pointer text-xs text-muted-foreground">
									Raw JSON
								</summary>
								<pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs">
									{JSON.stringify(entry.raw, null, 2)}
								</pre>
							</details>
						</div>
					))}
				</div>
			</main>

			<footer className="border-t border-border px-4 py-3 md:px-6">
				<div className="mx-auto w-full max-w-4xl">
					<div className="rounded-2xl border border-border bg-background px-3 py-2">
						<Textarea
							value={text}
							onChange={(event) => setText(event.target.value)}
							rows={3}
							placeholder="Text to moderate..."
							className="min-h-[64px] resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
						/>
						<div className="grid gap-2 px-1 py-2 md:grid-cols-2">
							<Input
								value={imageUrl}
								onChange={(event) => setImageUrl(event.target.value)}
								placeholder="Image URL (optional)"
							/>
							<Input
								type="file"
								accept="image/*"
								onChange={(event) =>
									setImageFile(event.target.files?.[0] ?? null)
								}
							/>
						</div>
						<div className="flex items-center justify-between pt-2">
							{error ? (
								<span className="text-xs text-destructive">{error}</span>
							) : null}
							<Button
								className="ml-auto"
								onClick={submit}
								disabled={isLoading || !modelId || !selectedModelEnabled}
							>
								{isLoading ? "Creating..." : "Create"}
							</Button>
						</div>
					</div>
				</div>
			</footer>
			{dialogProfile ? (
				<ModerationModelSettingsDialog
					open={modelSettings.modelSettingsOpen}
					onOpenChange={modelSettings.handleModelSettingsOpenChange}
					settings={dialogProfile}
					selectedModelId={dialogModelId}
					modelChoices={modelSettings.modelSettingsChoices}
					onModelChange={modelSettings.handleModelSettingsModelChange}
					providerOptions={modelSettings.providerOptions}
					supportedProvidersForModel={modelSettings.supportedProvidersForModel}
					onUpdateBase={(partial) => updateModelBaseSettings(partial)}
					onUpdateParams={(partial) => updateModelParams(partial)}
					onReset={resetModelSettings}
				/>
			) : null}
		</div>
	);
}
