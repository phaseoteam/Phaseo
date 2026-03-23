"use client";

import { useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import { APP_HEADERS } from "@/components/(chat)/playground/chat-playground-core";
import { extractGenerationUrls } from "@/lib/chat/roomRequestBuilders";
import {
	listRoomHistory,
	upsertRoomHistory,
	type NonTextRoomId,
} from "@/lib/indexeddb/chatRoomHistory";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RoomModelSelector } from "@/components/(chat)/RoomModelSelector";
import { useSidebar } from "@/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	useRoomModelSettings,
	type RoomModelProfile,
} from "@/components/(chat)/rooms/useRoomModelSettings";
import {
	buildImageRequestOptions,
	buildVideoRequestOptions,
	getDefaultImageRoomParams,
	getDefaultVideoRoomParams,
	type ImageRoomParams,
	type VideoRoomParams,
} from "@/lib/chat/roomModelSettings";
import { ImageModelSettingsDialog } from "@/components/(chat)/rooms/settings/ImageModelSettingsDialog";
import { VideoModelSettingsDialog } from "@/components/(chat)/rooms/settings/VideoModelSettingsDialog";
import {
	ChevronRight,
	Cpu,
	MessageCircleDashed,
	Settings as SettingsIcon,
} from "lucide-react";

type MediaStudioRoomProps = {
	roomId: "image" | "video";
	models: GatewaySupportedModel[];
};

type MediaHistoryPayload = {
	modelId: string;
	prompt: string;
	url: string;
	status: "pending" | "completed" | "failed";
};

type GenerationEntry = {
	id: string;
	createdAt: string;
	modelId: string;
	prompt: string;
	url: string;
	status: "pending" | "completed" | "failed";
	isTemporary?: boolean;
};

const MAX_VIDEO_POLL_ATTEMPTS = 80;
const VIDEO_POLL_INTERVAL_MS = 2500;

function nowIso() {
	return new Date().toISOString();
}

function getResourceId(payload: any): string | null {
	const candidates = [
		payload?.id,
		payload?.resource_id,
		payload?.video_id,
		payload?.video?.id,
		payload?.data?.id,
	];
	for (const value of candidates) {
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return null;
}

function getGenerationStatus(payload: any): string | null {
	const candidates = [
		payload?.status,
		payload?.state,
		payload?.video?.status,
		payload?.data?.status,
	];
	for (const value of candidates) {
		if (typeof value === "string" && value.trim()) {
			return value.trim().toLowerCase();
		}
	}
	return null;
}

function wait(ms: number) {
	return new Promise<void>((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

function toEntry(record: {
	id: string;
	createdAt: string;
	payload: MediaHistoryPayload;
}): GenerationEntry {
	return {
		id: record.id,
		createdAt: record.createdAt,
		modelId: record.payload.modelId,
		prompt: record.payload.prompt,
		url: record.payload.url,
		status: record.payload.status,
	};
}

export function MediaStudioRoom({ roomId, models }: MediaStudioRoomProps) {
	const isImageRoom = roomId === "image";
	const { toggleSidebar, state: sidebarState } = useSidebar();
	const filteredModels = useMemo(
		() => filterModelsForRoom(models, roomId).filter((model) => model.isAvailable),
		[models, roomId],
	);
	const [modelId, setModelId] = useState(filteredModels[0]?.modelId ?? "");
	const [temporaryMode, setTemporaryMode] = useState(false);
	const [prompt, setPrompt] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [entries, setEntries] = useState<GenerationEntry[]>([]);
	const modelSettings = useRoomModelSettings({
		roomId,
		models: filteredModels,
		selectedModelId: modelId,
		onModelChange: setModelId,
		getDefaultParams: (nextModelId) =>
			(isImageRoom
				? getDefaultImageRoomParams(nextModelId)
				: getDefaultVideoRoomParams(nextModelId)) as ImageRoomParams | VideoRoomParams,
	});
	const modelSettingsCompat = modelSettings as any;
	const selectedProfile =
		modelSettingsCompat.selectedProfile ?? modelSettingsCompat.activeModelSettings ?? null;
	const selectedModelEnabled = selectedProfile?.enabled !== false;
	const selectedProviderId = selectedProfile?.providerId;
	const composerSelectedModel = useMemo(
		() =>
			filteredModels.find(
				(model) =>
					model.modelId === modelId &&
					(!selectedProviderId || model.providerId === selectedProviderId),
			) ??
			filteredModels.find((model) => model.modelId === modelId) ??
			null,
		[filteredModels, modelId, selectedProviderId],
	);
	const composerModelLogoId =
		composerSelectedModel?.organisationId?.trim() ||
		composerSelectedModel?.providerId ||
		(modelId.split("/")[0] || "ai-stats");
	const composerModelLabel =
		(modelId &&
			(modelSettings.modelDisplayNameById[modelId] ||
				composerSelectedModel?.modelName ||
				modelId)) ||
		"Select model";
	const openComposerModelPicker = () => {
		const targetModelId = modelId || filteredModels[0]?.modelId;
		if (!targetModelId) return;
		if (targetModelId !== modelId) {
			setModelId(targetModelId);
		}
		modelSettings.openModelSettingsForModel(targetModelId);
	};
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
		void listRoomHistory<MediaHistoryPayload>(roomId as NonTextRoomId).then(
			(records) => {
				if (!mounted) return;
				setEntries(records.map((record) => toEntry(record)));
			},
		);
		return () => {
			mounted = false;
		};
	}, [roomId]);

	const addEntries = async (nextEntries: GenerationEntry[]) => {
		setEntries((prev) => [...nextEntries, ...prev]);
		const persistentEntries = nextEntries.filter((entry) => !entry.isTemporary);
		if (!persistentEntries.length) return;
		await Promise.all(
			persistentEntries.map((entry) =>
				upsertRoomHistory<MediaHistoryPayload>({
					id: entry.id,
					roomId,
					createdAt: entry.createdAt,
					updatedAt: entry.createdAt,
					payload: {
						modelId: entry.modelId,
						prompt: entry.prompt,
						url: entry.url,
						status: entry.status,
					},
				}),
			),
		);
	};

	const toggleTemporaryMode = () => {
		if (!temporaryMode) {
			setTemporaryMode(true);
			setPrompt("");
			setError(null);
			return;
		}
		setTemporaryMode(false);
		setEntries((current) => current.filter((entry) => !entry.isTemporary));
		setPrompt("");
		setError(null);
	};

	const submit = async () => {
		const trimmedPrompt = prompt.trim();
		if (!trimmedPrompt || !modelId || isLoading || !selectedModelEnabled) return;
		setError(null);
		setIsLoading(true);

		try {
			const requestBody: Record<string, unknown> = {
				model: modelId,
				prompt: trimmedPrompt,
			};
			if (selectedProviderId && selectedProviderId !== "auto") {
				requestBody.provider = {
					only: [selectedProviderId],
				};
			}
			if (roomId === "image") {
				Object.assign(
					requestBody,
					buildImageRequestOptions(
						modelId,
						(selectedProfile?.params as ImageRoomParams) ??
							getDefaultImageRoomParams(modelId),
					),
				);
			} else {
				Object.assign(
					requestBody,
					buildVideoRequestOptions(
						modelId,
						(selectedProfile?.params as VideoRoomParams) ??
							getDefaultVideoRoomParams(modelId),
					),
				);
			}

			const response = await fetch(`/api/chat/${roomId}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					requestBody,
					appHeaders: APP_HEADERS,
				}),
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(text || `Request failed (${response.status})`);
			}

			const createdAt = nowIso();
			const contentType = response.headers.get("content-type") ?? "";
			if (!contentType.includes("application/json")) {
				const blob = await response.blob();
				const objectUrl = URL.createObjectURL(blob);
				await addEntries([
					{
						id: crypto.randomUUID(),
						createdAt,
						modelId,
						prompt: trimmedPrompt,
						url: objectUrl,
						status: "completed",
						isTemporary: temporaryMode,
					},
				]);
				setPrompt("");
				return;
			}

			let payload = await response.json();
			let urls = extractGenerationUrls(payload);
			let status = getGenerationStatus(payload);
			const resourceId = getResourceId(payload);

			if (roomId === "video" && !urls.length && resourceId) {
				for (let i = 0; i < MAX_VIDEO_POLL_ATTEMPTS; i += 1) {
					await wait(VIDEO_POLL_INTERVAL_MS);
					const pollResponse = await fetch("/api/chat/video", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							poll: { resourceId },
							appHeaders: APP_HEADERS,
						}),
					});
					if (!pollResponse.ok) continue;
					const pollType = pollResponse.headers.get("content-type") ?? "";
					if (!pollType.includes("application/json")) {
						const pollBlob = await pollResponse.blob();
						const objectUrl = URL.createObjectURL(pollBlob);
						urls = [objectUrl];
						status = "completed";
						break;
					}
					payload = await pollResponse.json();
					urls = extractGenerationUrls(payload);
					status = getGenerationStatus(payload);
					if (urls.length > 0) {
						status = "completed";
						break;
					}
					if (status && ["completed", "failed", "error"].includes(status)) {
						break;
					}
				}
			}

			const nextStatus: GenerationEntry["status"] =
				urls.length > 0 ? "completed" : status === "failed" ? "failed" : "pending";
			const nextEntries: GenerationEntry[] =
				urls.length > 0
					? urls.map((url) => ({
							id: crypto.randomUUID(),
							createdAt,
							modelId,
							prompt: trimmedPrompt,
							url,
							status: nextStatus,
							isTemporary: temporaryMode,
						}))
					: [
							{
								id: crypto.randomUUID(),
								createdAt,
								modelId,
								prompt: trimmedPrompt,
								url: "",
								status: nextStatus,
								isTemporary: temporaryMode,
							},
						];

			await addEntries(nextEntries);
			setPrompt("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Generation failed");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-3 md:px-5">
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
						<TooltipContent side={sidebarState === "collapsed" ? "right" : "bottom"} align="center" sideOffset={8}>Toggle sidebar</TooltipContent>
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
					<div className="flex items-center gap-2">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant={temporaryMode ? "secondary" : "ghost"}
									size="icon"
									onClick={toggleTemporaryMode}
								>
									<MessageCircleDashed className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Temporary chat</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => {
										if (!modelId) return;
										modelSettings.openModelSettingsForModel(modelId);
									}}
									disabled={!modelId}
								>
									<SettingsIcon className="h-5 w-5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Settings</TooltipContent>
						</Tooltip>
					</div>
				</header>

				<main className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-5 md:px-6">
				<div className="columns-1 gap-3 sm:columns-2 xl:columns-3">
					{entries.map((entry) => (
						<div
							key={entry.id}
							className="mb-3 break-inside-avoid overflow-hidden rounded-xl border border-border bg-card"
						>
							<div className="relative bg-muted/30">
								{entry.url ? (
									roomId === "image" ? (
										<img
											src={entry.url}
											alt={entry.prompt}
											className="h-full w-full object-cover"
										/>
									) : (
										<video
											src={entry.url}
											className="h-full w-full object-cover"
											controls
											preload="metadata"
										/>
									)
								) : (
									<div className="flex aspect-video items-center justify-center text-xs text-muted-foreground">
										{entry.status === "pending" ? "Processing..." : "No preview available"}
									</div>
								)}
							</div>
							<div className="space-y-2 p-3">
								<p className="line-clamp-2 text-sm">{entry.prompt}</p>
								<div className="flex items-center justify-between gap-2">
									<span className="text-xs text-muted-foreground">
										{new Date(entry.createdAt).toLocaleTimeString()}
									</span>
									{entry.url ? (
										<a
											className="text-xs font-medium underline underline-offset-2"
											href={entry.url}
											target="_blank"
											rel="noopener noreferrer"
											download
										>
											Download
										</a>
									) : (
										<span className="text-xs text-muted-foreground capitalize">
											{entry.status}
										</span>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			</main>

			<footer className="border-t border-border px-4 py-3 md:px-6">
				<div className="mx-auto w-full max-w-3xl">
					<div className="rounded-2xl border border-border bg-background px-3 py-2">
						<Textarea
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									void submit();
								}
							}}
							placeholder={
								roomId === "image"
									? "Describe the image you want to create..."
									: "Describe the video you want to create..."
							}
							rows={3}
							className="min-h-[64px] resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
						/>
						<div className="flex items-center justify-between pt-2">
							<div className="flex items-center gap-1.5">
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											className="h-8 gap-1.5 px-2"
											onClick={openComposerModelPicker}
											disabled={!modelId && filteredModels.length === 0}
										>
											{modelId ? (
												<Logo
													id={composerModelLogoId}
													alt={composerModelLabel}
													width={16}
													height={16}
													className="shrink-0 rounded-none"
												/>
											) : (
												<Cpu className="h-4 w-4 text-muted-foreground" />
											)}
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top">{composerModelLabel}</TooltipContent>
								</Tooltip>
								{error ? (
									<span className="pl-1 text-xs text-destructive">{error}</span>
								) : null}
							</div>
							<Button
								className="ml-auto"
								onClick={submit}
								disabled={
									!prompt.trim() || !modelId || isLoading || !selectedModelEnabled
								}
							>
								{isLoading ? "Creating..." : "Create"}
							</Button>
						</div>
					</div>
				</div>
			</footer>
			{roomId === "image" && dialogProfile ? (
				<ImageModelSettingsDialog
					open={modelSettings.modelSettingsOpen}
					onOpenChange={modelSettings.handleModelSettingsOpenChange}
					settings={dialogProfile as RoomModelProfile<ImageRoomParams>}
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
			{roomId === "video" && dialogProfile ? (
				<VideoModelSettingsDialog
					open={modelSettings.modelSettingsOpen}
					onOpenChange={modelSettings.handleModelSettingsOpenChange}
					settings={dialogProfile as RoomModelProfile<VideoRoomParams>}
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
