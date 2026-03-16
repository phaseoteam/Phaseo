"use client";

import { useEffect, useMemo, useState } from "react";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import { APP_HEADERS } from "@/components/(chat)/playground/chat-playground-core";
import {
	buildEmbeddingsMultimodalInput,
	extractEmbeddingVectors,
	projectVectorsPca2d,
	type EmbeddingContentPart,
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
	buildEmbeddingsRequestOptions,
	getDefaultEmbeddingsRoomParams,
	type EmbeddingsRoomParams,
} from "@/lib/chat/roomModelSettings";
import { EmbeddingsModelSettingsDialog } from "@/components/(chat)/rooms/settings/EmbeddingsModelSettingsDialog";
import { ChevronRight } from "lucide-react";

type ScatterPoint = {
	x: number;
	y: number;
	index: number;
	label: string;
};

type EmbeddingRow = {
	index: number;
	vector: number[];
	meta: Record<string, unknown>;
};

type EmbeddingHistoryPayload = {
	modelId: string;
	summary: string;
	raw: unknown;
};

type EmbeddingEntry = {
	id: string;
	createdAt: string;
	modelId: string;
	summary: string;
	raw: unknown;
};

function nowIso() {
	return new Date().toISOString();
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
		reader.onload = () => resolve(String(reader.result ?? ""));
		reader.readAsDataURL(file);
	});
}

function splitDataUrl(dataUrl: string): { mimeType: string; data: string } {
	const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
	if (!match) {
		return { mimeType: "application/octet-stream", data: "" };
	}
	return { mimeType: match[1], data: match[2] };
}

function normalizePoints(points: ScatterPoint[]): ScatterPoint[] {
	if (!points.length) return [];
	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	const spanX = Math.max(1e-9, maxX - minX);
	const spanY = Math.max(1e-9, maxY - minY);
	return points.map((point) => ({
		...point,
		x: (point.x - minX) / spanX,
		y: (point.y - minY) / spanY,
	}));
}

function projectPayload(payload: any): {
	rows: EmbeddingRow[];
	points: ScatterPoint[];
} {
	const vectors = extractEmbeddingVectors(payload);
	const points = projectVectorsPca2d(vectors).map((point, index) => ({
		x: point.x,
		y: point.y,
		index,
		label: `Vector ${index + 1}`,
	}));
	const normalizedPoints = normalizePoints(points);
	const rows: EmbeddingRow[] = vectors.map((vector, index) => ({
		index,
		vector,
		meta:
			(payload?.data?.[index] && typeof payload.data[index] === "object"
				? payload.data[index]
				: {}) ?? {},
	}));
	return { rows, points: normalizedPoints };
}

function toEntry(record: {
	id: string;
	createdAt: string;
	payload: EmbeddingHistoryPayload;
}): EmbeddingEntry {
	return {
		id: record.id,
		createdAt: record.createdAt,
		modelId: record.payload.modelId,
		summary: record.payload.summary,
		raw: record.payload.raw,
	};
}

export function EmbeddingsRoom({ models }: { models: GatewaySupportedModel[] }) {
	const { toggleSidebar, state: sidebarState } = useSidebar();
	const filteredModels = useMemo(
		() =>
			filterModelsForRoom(models, "embeddings").filter(
				(model) => model.isAvailable,
			),
		[models],
	);
	const [modelId, setModelId] = useState(filteredModels[0]?.modelId ?? "");
	const [textInput, setTextInput] = useState("");
	const [imageUrl, setImageUrl] = useState("");
	const [audioUrl, setAudioUrl] = useState("");
	const [videoUrl, setVideoUrl] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [entries, setEntries] = useState<EmbeddingEntry[]>([]);
	const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
	const [activeIndex, setActiveIndex] = useState<number | null>(null);
	const modelSettings = useRoomModelSettings({
		roomId: "embeddings",
		models: filteredModels,
		selectedModelId: modelId,
		onModelChange: setModelId,
		getDefaultParams: () => getDefaultEmbeddingsRoomParams(),
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
		void listRoomHistory<EmbeddingHistoryPayload>(
			"embeddings" as NonTextRoomId,
		).then((records) => {
			if (!mounted) return;
			const nextEntries = records.map((record) => toEntry(record));
			setEntries(nextEntries);
			setActiveEntryId(nextEntries[0]?.id ?? null);
		});
		return () => {
			mounted = false;
		};
	}, []);

	const activeEntry = useMemo(
		() => entries.find((entry) => entry.id === activeEntryId) ?? entries[0] ?? null,
		[entries, activeEntryId],
	);
	const projected = useMemo(
		() => (activeEntry ? projectPayload(activeEntry.raw) : { rows: [], points: [] }),
		[activeEntry],
	);

	useEffect(() => {
		setActiveIndex(projected.points[0]?.index ?? null);
	}, [projected.points]);

	const submit = async () => {
		if (!modelId || isLoading || !selectedModelEnabled) return;
		setError(null);
		setIsLoading(true);
		try {
			const parts: EmbeddingContentPart[] = [];
			const trimmedText = textInput.trim();
			if (trimmedText) {
				parts.push({ type: "input_text", text: trimmedText });
			}
			if (imageUrl.trim()) {
				parts.push({ type: "input_image", image_url: imageUrl.trim() });
			}
			if (audioUrl.trim()) {
				parts.push({
					type: "input_audio",
					input_audio: {
						url: audioUrl.trim(),
					},
				});
			}
			if (videoUrl.trim()) {
				parts.push({ type: "input_video", url: videoUrl.trim() });
			}

			for (const file of files) {
				const dataUrl = await readFileAsDataUrl(file);
				if (file.type.startsWith("image/")) {
					parts.push({ type: "input_image", image_url: dataUrl });
					continue;
				}
				if (file.type.startsWith("audio/")) {
					const { data, mimeType } = splitDataUrl(dataUrl);
					const format = mimeType.split("/")[1]?.split(";")[0] || "wav";
					parts.push({
						type: "input_audio",
						input_audio: {
							data,
							format,
						},
					});
					continue;
				}
				if (file.type.startsWith("video/")) {
					parts.push({ type: "input_video", url: dataUrl });
					continue;
				}
				if (file.type.startsWith("text/")) {
					const text = await file.text();
					if (text.trim()) {
						parts.push({ type: "input_text", text: text.trim() });
					}
				}
			}

			if (!parts.length) {
				throw new Error("Provide at least one text/image/audio/video input.");
			}

			const response = await fetch("/api/chat/embeddings", {
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
							...buildEmbeddingsRequestOptions(
								modelId,
								(selectedProfile?.params as EmbeddingsRoomParams) ??
									getDefaultEmbeddingsRoomParams(),
							),
							input: buildEmbeddingsMultimodalInput(parts),
						},
						appHeaders: APP_HEADERS,
				}),
			});
			if (!response.ok) {
				const text = await response.text();
				throw new Error(text || `Request failed (${response.status})`);
			}
			const payload = await response.json();
			const summary = [
				trimmedText ? `text: ${trimmedText.slice(0, 80)}` : null,
				imageUrl.trim() ? "image url" : null,
				audioUrl.trim() ? "audio url" : null,
				videoUrl.trim() ? "video url" : null,
				files.length ? `${files.length} file(s)` : null,
			]
				.filter(Boolean)
				.join(" | ");
			const entry: EmbeddingEntry = {
				id: crypto.randomUUID(),
				createdAt: nowIso(),
				modelId,
				summary: summary || "Embedding request",
				raw: payload,
			};
			setEntries((prev) => [entry, ...prev]);
			setActiveEntryId(entry.id);
			await upsertRoomHistory<EmbeddingHistoryPayload>({
				id: entry.id,
				roomId: "embeddings",
				createdAt: entry.createdAt,
				updatedAt: entry.createdAt,
				payload: {
					modelId: entry.modelId,
					summary: entry.summary,
					raw: entry.raw,
				},
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Embeddings request failed");
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
					<Badge variant="secondary">{entries.length} runs</Badge>
				</header>

			<main className="min-h-0 flex-1 overflow-auto px-4 py-5 md:px-6">
				<div className="grid gap-4 lg:grid-cols-[260px_1fr]">
					<div className="space-y-2">
						{entries.map((entry) => (
							<button
								key={entry.id}
								type="button"
								onClick={() => setActiveEntryId(entry.id)}
								className={`w-full rounded-lg border p-3 text-left ${
									activeEntryId === entry.id
										? "border-primary bg-primary/5"
										: "border-border bg-card"
								}`}
							>
								<p className="text-xs text-muted-foreground">
									{new Date(entry.createdAt).toLocaleTimeString()}
								</p>
								<p className="mt-1 line-clamp-2 text-xs">{entry.summary}</p>
							</button>
						))}
					</div>

					<div className="space-y-4">
						{activeEntry ? (
							<>
								<div className="rounded-2xl border border-border bg-card p-4">
									<h2 className="mb-3 text-sm font-semibold">2D projection (PCA)</h2>
									<svg
										viewBox="0 0 560 320"
										className="h-[320px] w-full rounded-lg bg-muted/20"
									>
										<rect x="0" y="0" width="560" height="320" fill="transparent" />
										{projected.points.map((point) => {
											const cx = 24 + point.x * 512;
											const cy = 296 - point.y * 272;
											const active = point.index === activeIndex;
											return (
												<g
													key={point.index}
													onMouseEnter={() => setActiveIndex(point.index)}
													onClick={() => setActiveIndex(point.index)}
												>
													<circle
														cx={cx}
														cy={cy}
														r={active ? 7 : 5}
														fill={active ? "#2563eb" : "#64748b"}
													/>
													<title>{point.label}</title>
												</g>
											);
										})}
									</svg>
								</div>

								<div className="rounded-2xl border border-border bg-card p-4">
									<h2 className="mb-3 text-sm font-semibold">Vectors</h2>
									<div className="max-h-[280px] overflow-auto rounded-md border border-border">
										<table className="w-full text-xs">
											<thead className="sticky top-0 bg-muted/60">
												<tr>
													<th className="px-2 py-1 text-left">#</th>
													<th className="px-2 py-1 text-left">Preview</th>
													<th className="px-2 py-1 text-left">Dims</th>
												</tr>
											</thead>
											<tbody>
												{projected.rows.map((row) => (
													<tr
														key={row.index}
														className={
															activeIndex === row.index
																? "bg-primary/10"
																: "hover:bg-muted/40"
														}
														onMouseEnter={() => setActiveIndex(row.index)}
													>
														<td className="px-2 py-1">{row.index + 1}</td>
														<td className="px-2 py-1 font-mono">
															{row.vector
																.slice(0, 6)
																.map((value) => value.toFixed(4))
																.join(", ")}
														</td>
														<td className="px-2 py-1">{row.vector.length}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
									<details className="mt-3">
										<summary className="cursor-pointer text-xs text-muted-foreground">
											Raw JSON
										</summary>
										<pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs">
											{JSON.stringify(activeEntry.raw, null, 2)}
										</pre>
									</details>
								</div>
							</>
						) : (
							<div className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
								No embeddings history yet.
							</div>
						)}
					</div>
				</div>
			</main>

			<footer className="border-t border-border px-4 py-3 md:px-6">
				<div className="mx-auto w-full max-w-5xl">
					<div className="rounded-2xl border border-border bg-background px-3 py-2">
						<Textarea
							value={textInput}
							onChange={(event) => setTextInput(event.target.value)}
							rows={3}
							placeholder="Text input for embeddings (optional if using URLs/files)..."
							className="min-h-[64px] resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
						/>
						<div className="grid gap-2 px-1 py-2 md:grid-cols-3">
							<Input
								value={imageUrl}
								onChange={(event) => setImageUrl(event.target.value)}
								placeholder="Image URL"
							/>
							<Input
								value={audioUrl}
								onChange={(event) => setAudioUrl(event.target.value)}
								placeholder="Audio URL"
							/>
							<Input
								value={videoUrl}
								onChange={(event) => setVideoUrl(event.target.value)}
								placeholder="Video URL"
							/>
						</div>
						<div className="grid gap-2 px-1 py-2 md:grid-cols-[1fr_auto]">
							<Input
								type="file"
								multiple
								accept="image/*,audio/*,video/*,text/*"
								onChange={(event) =>
									setFiles(Array.from(event.target.files ?? []))
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
				<EmbeddingsModelSettingsDialog
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
