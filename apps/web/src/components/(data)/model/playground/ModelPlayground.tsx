"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Streamdown } from "streamdown";
import {
	Clock3,
	FileText,
	Mic,
	MessageSquare,
	Sparkles,
	TerminalSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { extractResponseText } from "@/components/(chat)/chatPayload";
import { extractTotalCostUsd } from "@/components/(chat)/playground/chat-playground-core";

const PLAYGROUND_APP_HEADERS = {
	"x-app-id": "ai-stats-playground",
	"x-app-name": "AI Stats Playground",
	"x-title": "AI Stats Playground",
	"http-referer": "https://ai-stats.phaseo.app/models",
};

type ModelPlaygroundProps = {
	modelId: string;
	requestModelId?: string;
	modelName: string;
};

type PlaygroundStats = {
	elapsedMs: number;
	totalTokens: number | null;
	throughputTokensPerSecond: number | null;
	totalCostUsd: string | null;
};

type SseFrame = {
	eventType: string;
	data: string | null;
};

type PlaygroundMode = "text" | "audio";

function toFiniteNumber(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}
	return value;
}

function extractUsage(payload: any): Record<string, unknown> | null {
	const usage =
		payload?.usage ??
		payload?.response?.usage ??
		payload?.response?.output?.usage ??
		null;
	return usage && typeof usage === "object"
		? (usage as Record<string, unknown>)
		: null;
}

function extractMeta(payload: any): Record<string, unknown> | null {
	const meta = payload?.meta ?? payload?.response?.meta ?? null;
	return meta && typeof meta === "object"
		? (meta as Record<string, unknown>)
		: null;
}

function extractTotalTokens(usage: Record<string, unknown> | null): number | null {
	if (!usage) return null;
	const direct =
		toFiniteNumber((usage as any).total_tokens) ??
		toFiniteNumber((usage as any).totalTokens) ??
		toFiniteNumber((usage as any).output_text_tokens) ??
		toFiniteNumber((usage as any).output_tokens) ??
		toFiniteNumber((usage as any).outputTokens);
	if (direct != null) return direct;

	const input =
		toFiniteNumber((usage as any).input_text_tokens) ??
		toFiniteNumber((usage as any).input_tokens) ??
		toFiniteNumber((usage as any).prompt_tokens);
	const output =
		toFiniteNumber((usage as any).output_text_tokens) ??
		toFiniteNumber((usage as any).output_tokens) ??
		toFiniteNumber((usage as any).completion_tokens);
	if (input == null && output == null) return null;
	return (input ?? 0) + (output ?? 0);
}

function extractThroughputTokensPerSecond(
	meta: Record<string, unknown> | null,
	totalTokens: number | null,
	elapsedMs: number,
): number | null {
	const fromMeta =
		toFiniteNumber((meta as any)?.throughput_tps) ??
		toFiniteNumber((meta as any)?.throughput_tokens_per_second) ??
		toFiniteNumber((meta as any)?.throughputTokensPerSecond) ??
		toFiniteNumber((meta as any)?.client?.throughputTokensPerSecond);
	if (fromMeta != null) return fromMeta;
	if (totalTokens == null || elapsedMs <= 0) return null;
	return totalTokens / (elapsedMs / 1000);
}

function formatDuration(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(totalTokens: number | null): string {
	if (totalTokens == null) return "N/A tokens";
	return `${Math.round(totalTokens).toLocaleString()} tokens`;
}

function formatThroughput(tokensPerSecond: number | null): string {
	if (tokensPerSecond == null) return "N/A tok/s";
	return `${tokensPerSecond.toFixed(1)} tok/s`;
}

function formatCost(totalCostUsd: string | null): string {
	if (!totalCostUsd) return "$0.000000";
	const asNumber = Number.parseFloat(totalCostUsd);
	if (!Number.isFinite(asNumber)) return "$0.000000";
	return `$${asNumber.toFixed(6)}`;
}

function parseSseFrame(frame: string): SseFrame {
	const lines = frame.split(/\r?\n/);
	let eventType = "";
	const dataLines: string[] = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (trimmed.startsWith("event:")) {
			eventType = trimmed.slice(6).trim();
			continue;
		}
		if (trimmed.startsWith("data:")) {
			dataLines.push(trimmed.slice(5).trimStart());
		}
	}
	const data = dataLines.join("").trim();
	return {
		eventType,
		data: data.length > 0 ? data : null,
	};
}

async function readErrorMessage(response: Response): Promise<string> {
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		try {
			const payload = (await response.json()) as Record<string, unknown> | null;
			if (payload && typeof payload.message === "string" && payload.message.trim()) {
				return payload.message;
			}
			if (payload && typeof payload.error === "string" && payload.error.trim()) {
				return payload.error;
			}
		} catch {
			return `Request failed (${response.status}).`;
		}
	}

	const rawText = await response.text();
	const text = rawText.trim();
	if (text) return text;
	return `Request failed (${response.status}).`;
}

export default function ModelPlayground({
	modelId,
	requestModelId,
	modelName,
}: ModelPlaygroundProps) {
	const [mode, setMode] = useState<PlaygroundMode>("text");
	const [prompt, setPrompt] = useState("");
	const [responseText, setResponseText] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [stats, setStats] = useState<PlaygroundStats | null>(null);
	const [elapsedMs, setElapsedMs] = useState(0);
	const startRef = useRef<number | null>(null);

	const trimmedPrompt = prompt.trim();
	const hasPrompt = trimmedPrompt.length > 0;
	const resolvedRequestModelId = (requestModelId ?? "").trim() || modelId;
	const chatHref = useMemo(
		() => {
			const modelPart = `model=${encodeURIComponent(resolvedRequestModelId)}`;
			if (!trimmedPrompt) return `/chat?${modelPart}`;
			return `/chat?${modelPart}&prompt=${encodeURIComponent(trimmedPrompt)}`;
		},
		[resolvedRequestModelId, trimmedPrompt],
	);
	const audioRoomHref = useMemo(() => {
		const modelPart = `model=${encodeURIComponent(resolvedRequestModelId)}`;
		return `/chat/audio?${modelPart}`;
	}, [resolvedRequestModelId]);

	useEffect(() => {
		if (!isGenerating || startRef.current == null) return;
		const timer = window.setInterval(() => {
			if (startRef.current == null) return;
			setElapsedMs(Math.max(0, performance.now() - startRef.current));
		}, 100);
		return () => window.clearInterval(timer);
	}, [isGenerating]);

	const handleGenerate = async () => {
		if (!trimmedPrompt || isGenerating) return;

		setIsGenerating(true);
		setError(null);
		setStats(null);
		setResponseText("");
		startRef.current = performance.now();
		setElapsedMs(0);

		let finalUsage: Record<string, unknown> | null = null;
		let finalMeta: Record<string, unknown> | null = null;
		let streamingText = "";

		try {
			const response = await fetch("/api/chat/playground", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					requestBody: {
						model: resolvedRequestModelId,
						stream: true,
						input: [{ role: "user", content: trimmedPrompt }],
					},
					appHeaders: PLAYGROUND_APP_HEADERS,
				}),
			});

			if (!response.ok) {
				throw new Error(await readErrorMessage(response));
			}

			const contentType = response.headers.get("content-type") ?? "";
			if (response.body && contentType.includes("text/event-stream")) {
				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const frames = buffer.split(/\r?\n\r?\n/);
					buffer = frames.pop() ?? "";

					for (const frame of frames) {
						const { eventType, data } = parseSseFrame(frame);
						if (!data || data === "[DONE]") continue;
						try {
							const parsed = JSON.parse(data);
							finalUsage = extractUsage(parsed) ?? finalUsage;
							finalMeta = extractMeta(parsed) ?? finalMeta;

							const frameType =
								typeof parsed?.type === "string" ? parsed.type : eventType;
							if (
								frameType === "response.output_text.delta" &&
								typeof parsed?.delta === "string"
							) {
								streamingText += parsed.delta;
								setResponseText(streamingText);
								continue;
							}
							if (
								frameType === "response.output_text.done" &&
								typeof parsed?.text === "string"
							) {
								streamingText = parsed.text;
								setResponseText(streamingText);
								continue;
							}
							if (frameType === "response.completed") {
								const completedPayload = parsed?.response ?? parsed;
								finalUsage = extractUsage(completedPayload) ?? finalUsage;
								finalMeta = extractMeta(completedPayload) ?? finalMeta;
								const finalText = extractResponseText(
									completedPayload,
								).trim();
								if (finalText) {
									streamingText = finalText;
									setResponseText(streamingText);
								}
								continue;
							}

							const fallbackDelta =
								typeof parsed?.delta === "string"
									? parsed.delta
									: typeof parsed?.text === "string"
										? parsed.text
										: "";
							if (fallbackDelta) {
								streamingText += fallbackDelta;
								setResponseText(streamingText);
							}
						} catch {
							// ignore malformed chunks
						}
					}
				}
			} else {
				const payload = contentType.includes("application/json")
					? await response.json()
					: { output_text: await response.text() };
				finalUsage = extractUsage(payload);
				finalMeta = extractMeta(payload);
				const nextResponse = extractResponseText(payload).trim();
				if (nextResponse) {
					streamingText = nextResponse;
					setResponseText(nextResponse);
				}
			}

			const endAt = performance.now();
			const totalElapsedMs =
				startRef.current == null
					? 0
					: Math.max(0, endAt - startRef.current);
			setElapsedMs(totalElapsedMs);
			const totalTokens = extractTotalTokens(finalUsage);
			const totalCostUsd = extractTotalCostUsd(finalUsage);
			const throughputTokensPerSecond = extractThroughputTokensPerSecond(
				finalMeta,
				totalTokens,
				totalElapsedMs,
			);
			setStats({
				elapsedMs: totalElapsedMs,
				totalTokens,
				throughputTokensPerSecond,
				totalCostUsd,
			});
			if (!streamingText.trim()) {
				setResponseText("Request completed.");
			}
		} catch (requestError) {
			const message =
				requestError instanceof Error
					? requestError.message
					: "Request failed. Please try again.";
			setError(message);
		} finally {
			setIsGenerating(false);
			startRef.current = null;
		}
	};

	const showEmptyResponse = !isGenerating && !responseText && !error;
	const showThinkingState = isGenerating && !responseText;
	const handlePromptKeyDown = (
		event: React.KeyboardEvent<HTMLTextAreaElement>,
	) => {
		if (event.key !== "Enter") return;
		if (event.shiftKey) return;
		if (event.nativeEvent.isComposing) return;
		event.preventDefault();
		void handleGenerate();
	};

	return (
		<div className="w-full space-y-4">
			<div className="space-y-2">
				<h2 className="text-2xl font-semibold tracking-tight">Try {modelName}</h2>
				<p className="text-base text-muted-foreground">
					Test this model directly in the playground.
				</p>
			</div>

			<div className="space-y-4 text-black dark:text-white">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-3 dark:border-white/15">
					<div className="inline-flex items-center rounded-md border border-black/20 p-1 dark:border-white/25">
						<button
							type="button"
							onClick={() => setMode("text")}
							className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium transition-colors ${
								mode === "text"
									? "bg-black text-white dark:bg-white dark:text-black"
									: "text-black/75 hover:bg-black/5 dark:text-white/75 dark:hover:bg-white/10"
							}`}
							aria-pressed={mode === "text"}
						>
							<FileText className="h-4 w-4" />
							Text
						</button>
						<button
							type="button"
							onClick={() => setMode("audio")}
							className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium transition-colors ${
								mode === "audio"
									? "bg-black text-white dark:bg-white dark:text-black"
									: "text-black/75 hover:bg-black/5 dark:text-white/75 dark:hover:bg-white/10"
							}`}
							aria-pressed={mode === "audio"}
						>
							<Mic className="h-4 w-4" />
							Audio
						</button>
					</div>
					{mode === "text"
						? isGenerating ? (
								<div className="inline-flex items-center gap-1.5 text-xs text-black/70 dark:text-white/70">
									<Clock3 className="h-3.5 w-3.5" />
									{formatDuration(elapsedMs)}
								</div>
							) : stats ? (
								<div className="text-xs text-black/70 dark:text-white/70">
									{`${formatDuration(stats.elapsedMs)} | ${formatTokens(
										stats.totalTokens,
									)} | ${formatThroughput(
										stats.throughputTokensPerSecond,
									)} | ${formatCost(stats.totalCostUsd)}`}
								</div>
							) : null
						: null}
				</div>

				{mode === "text" ? (
					<div className="grid gap-6 md:grid-cols-2">
						<div className="flex min-h-[440px] flex-col gap-3">
							<Textarea
								value={prompt}
								onChange={(event) => setPrompt(event.target.value)}
								onKeyDown={handlePromptKeyDown}
								placeholder="Enter your message..."
								className="min-h-[320px] resize-none border-black/20 bg-white text-base text-black placeholder:text-black/45 focus-visible:ring-black/40 dark:border-white/25 dark:bg-black dark:text-white dark:placeholder:text-white/50 dark:focus-visible:ring-white/40"
							/>
							<div className="grid grid-cols-2 gap-3">
								<Button
									type="button"
									asChild
									variant="outline"
									className="h-11 w-full border-black/30 bg-white text-black hover:bg-zinc-100 dark:border-white/30 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
								>
									<Link href={chatHref}>
										<MessageSquare className="h-4 w-4" />
										Open in Playground
									</Link>
								</Button>
								<Button
									type="button"
									onClick={handleGenerate}
									disabled={!hasPrompt || isGenerating}
									className="h-11 w-full bg-black text-white hover:bg-zinc-800 disabled:bg-zinc-500 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
								>
									<Sparkles className="h-4 w-4" />
									{isGenerating ? "Generating..." : "Generate"}
								</Button>
							</div>
							{error ? (
								<p className="rounded-md border border-black/20 bg-black/5 px-3 py-2 text-sm text-black dark:border-white/20 dark:bg-white/10 dark:text-white">
									{error}
								</p>
							) : null}
						</div>

						<div className="min-h-[440px] border-black/15 md:border-l md:pl-6 dark:border-white/20">
							{responseText ? (
								<div className="text-sm leading-6 text-black dark:text-white">
									<Streamdown>{responseText}</Streamdown>
								</div>
							) : showThinkingState ? (
								<div className="flex h-full flex-col items-center justify-center gap-3 text-black/55 dark:text-white/65">
									<TerminalSquare className="h-10 w-10" />
									<div className="flex items-end gap-1.5">
										<span
											className="h-2.5 w-2.5 animate-bounce rounded-full bg-current"
											style={{ animationDelay: "0ms" }}
										/>
										<span
											className="h-2.5 w-2.5 animate-bounce rounded-full bg-current"
											style={{ animationDelay: "140ms" }}
										/>
										<span
											className="h-2.5 w-2.5 animate-bounce rounded-full bg-current"
											style={{ animationDelay: "280ms" }}
										/>
									</div>
								</div>
							) : showEmptyResponse ? (
								<div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-black/55 dark:text-white/60">
									<TerminalSquare className="h-10 w-10" />
									<p>Response output appears here.</p>
								</div>
							) : null}
						</div>
					</div>
				) : (
					<div className="rounded-xl border border-black/15 bg-black/[0.02] p-6 dark:border-white/20 dark:bg-white/[0.03]">
						<div className="space-y-2">
							<h3 className="text-base font-semibold">Audio Playground</h3>
							<p className="text-sm text-black/70 dark:text-white/70">
								Use the audio room for speech generation, transcription, and
								translation workflows.
							</p>
						</div>
						<div className="mt-4">
							<Button
								type="button"
								asChild
								variant="outline"
								className="h-11 border-black/30 bg-white text-black hover:bg-zinc-100 dark:border-white/30 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
							>
								<Link href={audioRoomHref}>
									<Mic className="h-4 w-4" />
									Open Audio Room
								</Link>
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
