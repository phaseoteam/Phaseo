"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RoomModelSelector } from "@/components/(chat)/RoomModelSelector";
import { useSidebar } from "@/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRoomModelSettings } from "@/components/(chat)/rooms/useRoomModelSettings";
import {
	buildAudioRequestOptions,
	getDefaultAudioRoomParams,
	type AudioRoomParams,
} from "@/lib/chat/roomModelSettings";
import { AudioModelSettingsDialog } from "@/components/(chat)/rooms/settings/AudioModelSettingsDialog";
import { ChevronRight } from "lucide-react";

type AudioMode = "speech" | "transcription" | "translation";

type AudioHistoryPayload = {
	modelId: string;
	mode: AudioMode;
	text?: string;
	audioUrl?: string;
	raw?: unknown;
};

type AudioEntry = {
	id: string;
	createdAt: string;
	modelId: string;
	mode: AudioMode;
	text?: string;
	audioUrl?: string;
	raw?: unknown;
};

function nowIso() {
	return new Date().toISOString();
}

function readFileAsBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
		reader.onload = () => {
			const result = String(reader.result ?? "");
			const [, b64 = ""] = result.split(",", 2);
			resolve(b64);
		};
		reader.readAsDataURL(file);
	});
}

function toEntry(record: {
	id: string;
	createdAt: string;
	payload: AudioHistoryPayload;
}): AudioEntry {
	return {
		id: record.id,
		createdAt: record.createdAt,
		modelId: record.payload.modelId,
		mode: record.payload.mode,
		text: record.payload.text,
		audioUrl: record.payload.audioUrl,
		raw: record.payload.raw,
	};
}

export function AudioRoom({ models }: { models: GatewaySupportedModel[] }) {
	const { toggleSidebar, state: sidebarState } = useSidebar();
	const filteredModels = useMemo(
		() => filterModelsForRoom(models, "audio").filter((model) => model.isAvailable),
		[models],
	);
	const [mode, setMode] = useState<AudioMode>("speech");
	const [modelId, setModelId] = useState(filteredModels[0]?.modelId ?? "");
	const [textInput, setTextInput] = useState("");
	const [audioUrlInput, setAudioUrlInput] = useState("");
	const [audioFile, setAudioFile] = useState<File | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [entries, setEntries] = useState<AudioEntry[]>([]);
	const modelSettings = useRoomModelSettings({
		roomId: "audio",
		models: filteredModels,
		selectedModelId: modelId,
		onModelChange: setModelId,
		getDefaultParams: getDefaultAudioRoomParams,
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
		void listRoomHistory<AudioHistoryPayload>("audio" as NonTextRoomId).then(
			(records) => {
				if (!mounted) return;
				setEntries(records.map((record) => toEntry(record)));
			},
		);
		return () => {
			mounted = false;
		};
	}, []);

	const addEntry = async (entry: AudioEntry) => {
		setEntries((prev) => [entry, ...prev]);
		await upsertRoomHistory<AudioHistoryPayload>({
			id: entry.id,
			roomId: "audio",
			createdAt: entry.createdAt,
			updatedAt: entry.createdAt,
			payload: {
				modelId: entry.modelId,
				mode: entry.mode,
				text: entry.text,
				audioUrl: entry.audioUrl,
				raw: entry.raw,
			},
		});
	};

	const submit = async () => {
		if (!modelId || isLoading || !selectedModelEnabled) return;
		if (mode === "speech" && !textInput.trim()) return;
		if (
			(mode === "transcription" || mode === "translation") &&
			!audioUrlInput.trim() &&
			!audioFile
		) {
			return;
		}

		setError(null);
		setIsLoading(true);
		try {
			const requestBody: Record<string, unknown> = {
				model: modelId,
			};
			if (selectedProviderId && selectedProviderId !== "auto") {
				requestBody.provider = {
					only: [selectedProviderId],
				};
			}
			if (mode === "speech") {
				requestBody.input = textInput.trim();
			} else {
				if (audioUrlInput.trim()) {
					requestBody.audio_url = audioUrlInput.trim();
				}
				if (audioFile) {
					requestBody.audio_b64 = await readFileAsBase64(audioFile);
				}
			}
			Object.assign(
				requestBody,
				buildAudioRequestOptions(
					mode,
					modelId,
					(selectedProfile?.params as AudioRoomParams) ??
						getDefaultAudioRoomParams(modelId),
				),
			);

			const response = await fetch("/api/chat/audio", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: mode,
					requestBody,
					appHeaders: APP_HEADERS,
				}),
			});
			if (!response.ok) {
				const text = await response.text();
				throw new Error(text || `Request failed (${response.status})`);
			}

			const contentType = response.headers.get("content-type") ?? "";
			let payload: any = null;
			let audioUrl: string | undefined;
			let text: string | undefined;

			if (!contentType.includes("application/json")) {
				const blob = await response.blob();
				audioUrl = URL.createObjectURL(blob);
			} else {
				payload = await response.json();
				audioUrl = extractGenerationUrls(payload)[0];
				text =
					typeof payload?.text === "string"
						? payload.text
						: typeof payload?.output_text === "string"
							? payload.output_text
							: typeof payload?.transcript === "string"
								? payload.transcript
								: undefined;
			}

			await addEntry({
				id: crypto.randomUUID(),
				createdAt: nowIso(),
				modelId,
				mode,
				text,
				audioUrl,
				raw: payload,
			});
			if (mode === "speech") {
				setTextInput("");
			} else {
				setAudioUrlInput("");
				setAudioFile(null);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Audio request failed");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<header className="mt-1 border-b border-border px-3 py-3 md:px-5">
				<div className="flex flex-wrap items-center justify-between gap-2">
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
					<Badge variant="secondary">{entries.length} generations</Badge>
				</div>
			</header>

			<main className="min-h-0 flex-1 overflow-auto px-4 py-5 md:px-6">
				<div className="grid gap-3">
					{entries.map((entry) => (
						<div
							key={entry.id}
							className="rounded-xl border border-border bg-card p-4"
						>
							<div className="mb-2 flex items-center justify-between gap-3">
								<div className="text-sm font-medium capitalize">{entry.mode}</div>
								<div className="text-xs text-muted-foreground">
									{new Date(entry.createdAt).toLocaleTimeString()}
								</div>
							</div>
							{entry.audioUrl ? (
								<audio controls src={entry.audioUrl} className="w-full" />
							) : null}
							{entry.text ? (
								<pre className="mt-3 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
									{entry.text}
								</pre>
							) : null}
							{entry.raw ? (
								<details className="mt-2">
									<summary className="cursor-pointer text-xs text-muted-foreground">
										Raw JSON
									</summary>
									<pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs">
										{JSON.stringify(entry.raw, null, 2)}
									</pre>
								</details>
							) : null}
						</div>
					))}
				</div>
			</main>

			<footer className="border-t border-border px-4 py-3 md:px-6">
				<div className="mx-auto w-full max-w-4xl">
					<div className="rounded-2xl border border-border bg-background px-3 py-2">
						<div className="flex flex-wrap gap-2 px-1 py-1">
							{(["speech", "transcription", "translation"] as AudioMode[]).map(
								(option) => (
									<Button
										key={option}
										type="button"
										variant={mode === option ? "default" : "outline"}
										size="sm"
										onClick={() => setMode(option)}
										className="h-7 text-xs capitalize"
									>
										{option}
									</Button>
								),
							)}
						</div>
						{mode === "speech" ? (
							<Textarea
								value={textInput}
								onChange={(event) => setTextInput(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !event.shiftKey) {
										event.preventDefault();
										void submit();
									}
								}}
								rows={3}
								placeholder="Text to turn into audio..."
								className="min-h-[64px] resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
							/>
						) : (
							<div className="grid gap-2 px-1 py-2 md:grid-cols-2">
								<Input
									value={audioUrlInput}
									onChange={(event) => setAudioUrlInput(event.target.value)}
									placeholder="Audio URL (optional if file is attached)"
								/>
								<Input
									type="file"
									accept="audio/*"
									onChange={(event) =>
										setAudioFile(event.target.files?.[0] ?? null)
									}
								/>
							</div>
						)}
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
				<AudioModelSettingsDialog
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
