"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type {
	CompareSummary,
	CompareTraceResult,
	GatewayStageBreakdown,
	GatewayStageSummary,
	Stats,
} from "@/lib/internal/gatewayCompare";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchInternalWebApi, fetchInternalWebApiResponse } from "@/lib/web-api/client";

type CompareResponse = {
	config: {
		model: string;
		prompt: string;
		runs: number;
		maxCompletionTokens: number;
		endpoint: "chat_completions" | "responses";
		gatewayBaseUrl: string;
		openRouterBaseUrl: string;
		llmGatewayBaseUrl: string;
		vercelAiGatewayBaseUrl: string;
	};
	results: CompareTraceResult[];
	summaries: CompareSummary[];
};

type LiveTarget =
	| "phaseo"
	| "openrouter"
	| "llmgateway"
	| "vercel-ai-gateway";

type LiveEvent =
	| { type: "started"; target: LiveTarget }
	| { type: "headers"; target: LiveTarget; status: number; headersMs: number }
	| { type: "delta"; target: LiveTarget; atMs: number; text: string }
	| { type: "note"; target: LiveTarget; atMs: number; text: string }
	| { type: "done"; target: LiveTarget; status: number; totalMs: number; firstContentMs: number | null }
	| { type: "error"; target: LiveTarget; status: number; headersMs: number; totalMs: number; message: string }
	| { type: "fatal"; message: string };

type LivePaneState = {
	status: "idle" | "connecting" | "streaming" | "done" | "error";
	headersMs: number | null;
	firstContentMs: number | null;
	totalMs: number | null;
	text: string;
	notes: string[];
	error: string | null;
	httpStatus: number | null;
};

const DEFAULT_PROMPT = "Write one short sentence about distributed systems.";

const EMPTY_LIVE_PANE: LivePaneState = {
	status: "idle",
	headersMs: null,
	firstContentMs: null,
	totalMs: null,
	text: "",
	notes: [],
	error: null,
	httpStatus: null,
};

function formatMs(value: number | null | undefined, unavailableLabel: string) {
	return typeof value === "number" ? `${value.toFixed(1)} ms` : unavailableLabel;
}

function formatStats(
	stats: Stats | null,
	unavailableLabel: string,
	formatSummary: (p50: string, average: string) => string
) {
	if (!stats) return unavailableLabel;
	return formatSummary(stats.p50.toFixed(1), stats.avg.toFixed(1));
}

function getSummary(data: CompareResponse | null, target: CompareSummary["target"]) {
	return data?.summaries.find((summary) => summary.target === target) ?? null;
}

function targetLabel(target: CompareSummary["target"]): string {
	switch (target) {
		case "phaseo":
			return "Phaseo Gateway";
		case "openrouter":
			return "OpenRouter";
		case "llmgateway":
			return "LLMGateway";
		case "vercel-ai-gateway":
			return "Vercel AI Gateway";
	}
}

function formatCompactStats(
	stats: Stats | null,
	unavailableLabel: string,
	formatAverage: (average: string) => string
) {
	if (!stats) return unavailableLabel;
	return formatAverage(stats.avg.toFixed(1));
}

function maxTimelineValue(results: CompareTraceResult[]) {
	const all = results.flatMap((result) => [
		result.headersMs,
		result.firstByteMs ?? 0,
		result.firstContentMs ?? 0,
		result.totalMs,
	]);
	return Math.max(...all, 1);
}

function Timeline({
	result,
	maxValue,
}: {
	result: CompareTraceResult;
	maxValue: number;
}) {
	const t = useTranslations("Product.gatewayBenchmark");
	const bars = [
		{ label: t("metrics.headers"), value: result.headersMs, color: "bg-slate-500" },
		{ label: t("metrics.firstByte"), value: result.firstByteMs ?? 0, color: "bg-sky-500" },
		{ label: t("metrics.firstContent"), value: result.firstContentMs ?? 0, color: "bg-emerald-500" },
		{ label: t("metrics.total"), value: result.totalMs, color: "bg-amber-500" },
	];

	return (
		<div className="space-y-2">
			{bars.map((bar) => (
				<div key={bar.label} className="space-y-1">
					<div className="flex items-center justify-between text-xs text-muted-foreground">
						<span>{bar.label}</span>
						<span>{formatMs(bar.value, t("notAvailable"))}</span>
					</div>
					<div className="h-2 rounded-full bg-muted">
						<div
							className={`h-2 rounded-full ${bar.color}`}
							style={{ width: `${Math.max((bar.value / maxValue) * 100, 2)}%` }}
						/>
					</div>
				</div>
			))}
		</div>
	);
}

function FramePreview({ result }: { result: CompareTraceResult }) {
	const t = useTranslations("Product.gatewayBenchmark");
	return (
		<div className="space-y-2">
			{result.firstFrames.slice(0, 4).map((frame, index) => (
				<div key={`${result.target}-${result.run}-${index}`} className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
					<div className="font-medium text-foreground">
						{frame.atMs.toFixed(1)} ms | {frame.event ?? frame.object ?? frame.type ?? frame.dataKind}
					</div>
					<div className="text-muted-foreground">
						{frame.hasContent ? t("frameContent", { count: frame.contentLength }) : t("frameNoContent")}
						{frame.hasUsage ? ` | ${t("frameUsage")}` : ""}
						{frame.isDone ? ` | ${t("frameDone")}` : ""}
					</div>
					{frame.dataPreview ? (
						<div className="mt-1 font-mono text-[11px] text-muted-foreground">
							{frame.dataPreview}
						</div>
					) : null}
				</div>
			))}
		</div>
	);
}

function GatewayStageTable({
	breakdown,
	summary,
}: {
	breakdown?: GatewayStageBreakdown | null;
	summary?: GatewayStageSummary | null;
}) {
	const t = useTranslations("Product.gatewayBenchmark");
	const stageLabels = {
		before: t("stages.before"),
		protocol: t("stages.protocol"),
		irDecode: t("stages.irDecode"),
		candidates: t("stages.candidates"),
		modalities: t("stages.modalities"),
		rank: t("stages.rank"),
		breaker: t("stages.breaker"),
		priceCard: t("stages.priceCard"),
		resolveExecutor: t("stages.resolveExecutor"),
		normalizeIr: t("stages.normalizeIr"),
		requestBuild: t("stages.requestBuild"),
		upstreamHeaders: t("stages.upstreamHeaders"),
		headersToFirstByte: t("stages.headersToFirstByte"),
		headersToContent: t("stages.headersToContent"),
		accountedHeaders: t("stages.accountedHeaders"),
		unaccountedHeaders: t("stages.unaccountedHeaders"),
	};
	const rows = summary
		? [
				{ labelKey: "before" as const, value: summary.beforeMs },
				{ labelKey: "protocol" as const, value: summary.protocolDetectMs },
				{ labelKey: "irDecode" as const, value: summary.irDecodeMs },
				{ labelKey: "candidates" as const, value: summary.executeGuardCandidatesMs },
				{ labelKey: "modalities" as const, value: summary.executeFilterModalitiesMs },
				{ labelKey: "rank" as const, value: summary.executeRankProvidersMs },
				{ labelKey: "breaker" as const, value: summary.attemptBreakerMs },
				{ labelKey: "priceCard" as const, value: summary.attemptLoadPricecardMs },
				{ labelKey: "resolveExecutor" as const, value: summary.attemptResolveExecutorMs },
				{ labelKey: "normalizeIr" as const, value: summary.attemptNormalizeIrMs },
				{ labelKey: "requestBuild" as const, value: summary.attemptRequestBuildMs },
				{ labelKey: "upstreamHeaders" as const, value: summary.attemptUpstreamHeadersMs },
				{ labelKey: "headersToFirstByte" as const, value: summary.headersToFirstByteMs },
				{ labelKey: "headersToContent" as const, value: summary.headersToFirstContentMs },
				{ labelKey: "accountedHeaders" as const, value: summary.accountedHeadersMs },
				{ labelKey: "unaccountedHeaders" as const, value: summary.unaccountedHeadersMs },
			]
		: breakdown
			? [
					{ labelKey: "before" as const, value: breakdown.beforeMs },
					{ labelKey: "protocol" as const, value: breakdown.protocolDetectMs },
					{ labelKey: "irDecode" as const, value: breakdown.irDecodeMs },
					{ labelKey: "candidates" as const, value: breakdown.executeGuardCandidatesMs },
					{ labelKey: "modalities" as const, value: breakdown.executeFilterModalitiesMs },
					{ labelKey: "rank" as const, value: breakdown.executeRankProvidersMs },
					{ labelKey: "breaker" as const, value: breakdown.attemptBreakerMs },
					{ labelKey: "priceCard" as const, value: breakdown.attemptLoadPricecardMs },
					{ labelKey: "resolveExecutor" as const, value: breakdown.attemptResolveExecutorMs },
					{ labelKey: "normalizeIr" as const, value: breakdown.attemptNormalizeIrMs },
					{ labelKey: "requestBuild" as const, value: breakdown.attemptRequestBuildMs },
					{ labelKey: "upstreamHeaders" as const, value: breakdown.attemptUpstreamHeadersMs },
					{ labelKey: "headersToFirstByte" as const, value: breakdown.headersToFirstByteMs },
					{ labelKey: "headersToContent" as const, value: breakdown.headersToFirstContentMs },
					{ labelKey: "accountedHeaders" as const, value: breakdown.accountedHeadersMs },
					{ labelKey: "unaccountedHeaders" as const, value: breakdown.unaccountedHeadersMs },
				]
			: [];

	if (!rows.length) return null;

	return (
		<div className="grid gap-2 sm:grid-cols-2">
			{rows.map((row) => (
				<div key={row.labelKey} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-xs">
					<span className="text-muted-foreground">{stageLabels[row.labelKey]}</span>
					<span className="font-medium text-foreground">
						{summary
							? formatCompactStats(row.value as Stats | null, t("notAvailable"), (average) => t("compactStats", { average: t("averageShort"), value: average }))
							: formatMs(row.value as number | null, t("notAvailable"))}
					</span>
				</div>
			))}
		</div>
	);
}

function SummaryStats({ summary }: { summary: CompareSummary | null }) {
	const t = useTranslations("Product.gatewayBenchmark");
	const formatSummaryStats = (stats: Stats | null) =>
		formatStats(stats, t("notAvailable"), (p50, average) =>
			t("statsSummary", {
				p50Label: "p50",
				p50,
				averageLabel: t("averageLabel"),
				average,
			})
		);

	return (
		<CardContent className="space-y-2 text-sm">
			<div>{t("metrics.headers")}: {formatSummaryStats(summary?.headersMs ?? null)}</div>
			<div>{t("metrics.firstByte")}: {formatSummaryStats(summary?.firstByteMs ?? null)}</div>
			<div>{t("metrics.firstContent")}: {formatSummaryStats(summary?.firstContentMs ?? null)}</div>
			<div>{t("metrics.total")}: {formatSummaryStats(summary?.totalMs ?? null)}</div>
		</CardContent>
	);
}

function liveBadgeVariant(status: LivePaneState["status"]): "outline" | "secondary" | "destructive" {
	if (status === "error") return "destructive";
	if (status === "done") return "outline";
	return "secondary";
}

function LiveStreamPane({
	label,
	baseUrl,
	state,
}: {
	label: string;
	baseUrl: string;
	state: LivePaneState;
}) {
	const t = useTranslations("Product.gatewayBenchmark");
	const statusLabels: Record<LivePaneState["status"], string> = {
		idle: t("statuses.idle"),
		connecting: t("statuses.connecting"),
		streaming: t("statuses.streaming"),
		done: t("statuses.done"),
		error: t("statuses.error"),
	};
	return (
		<Card className="h-full">
			<CardHeader>
				<CardTitle className="flex items-center justify-between">
					<span>{label}</span>
					<Badge variant={liveBadgeVariant(state.status)}>{statusLabels[state.status]}</Badge>
				</CardTitle>
				<CardDescription>{baseUrl}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-3 gap-3 text-xs">
					<div className="rounded-md border bg-muted/20 px-3 py-2">
						<div className="text-muted-foreground">{t("metrics.headers")}</div>
						<div className="font-medium">{formatMs(state.headersMs, t("notAvailable"))}</div>
					</div>
					<div className="rounded-md border bg-muted/20 px-3 py-2">
						<div className="text-muted-foreground">{t("metrics.firstContent")}</div>
						<div className="font-medium">{formatMs(state.firstContentMs, t("notAvailable"))}</div>
					</div>
					<div className="rounded-md border bg-muted/20 px-3 py-2">
						<div className="text-muted-foreground">{t("metrics.total")}</div>
						<div className="font-medium">{formatMs(state.totalMs, t("notAvailable"))}</div>
					</div>
				</div>

				<div className="rounded-lg border bg-black px-4 py-3">
					<div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-zinc-400">
						<span>{t("liveStream")}</span>
						<span>{state.httpStatus ? `HTTP ${state.httpStatus}` : t("statuses.connecting")}</span>
					</div>
					<div className="h-64 overflow-y-auto whitespace-pre-wrap font-mono text-sm leading-6 text-zinc-100">
						{state.text || <span className="text-zinc-500">{t("waitingForContent")}</span>}
					</div>
				</div>

				<div className="space-y-2">
					<div className="text-xs font-medium text-muted-foreground">{t("eventLog")}</div>
					<div className="space-y-2">
						{state.notes.length ? (
							state.notes.map((note, index) => (
								<div key={`${label}-${index}`} className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
									{note}
								</div>
							))
						) : (
							<div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
							{t("noStreamEvents")}
							</div>
						)}
					</div>
				</div>

				{state.error ? (
					<div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
						{t("providerError", { message: state.error })}
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function applyLiveEvent(
	previous: LivePaneState,
	event: LiveEvent,
	labels: {
		headers: (elapsed: string, status: number) => string;
		note: (elapsed: string, detail: string) => string;
		done: (elapsed: string) => string;
		error: (message: string) => string;
	}
): LivePaneState {
	switch (event.type) {
		case "started":
			return { ...previous, status: "connecting" };
		case "headers":
			return {
				...previous,
				status: "streaming",
				httpStatus: event.status,
				headersMs: event.headersMs,
				notes: [...previous.notes, labels.headers(event.headersMs.toFixed(1), event.status)].slice(-6),
			};
		case "delta":
			return {
				...previous,
				status: "streaming",
				text: `${previous.text}${event.text}`,
				firstContentMs: previous.firstContentMs ?? event.atMs,
			};
		case "note":
			return {
				...previous,
				status: previous.status === "idle" ? "connecting" : previous.status,
				notes: [...previous.notes, labels.note(event.atMs.toFixed(1), event.text)].slice(-6),
			};
		case "done":
			return {
				...previous,
				status: "done",
				httpStatus: event.status,
				totalMs: event.totalMs,
				firstContentMs: previous.firstContentMs ?? event.firstContentMs,
				notes: [...previous.notes, labels.done(event.totalMs.toFixed(1))].slice(-6),
			};
		case "error":
			return {
				...previous,
				status: "error",
				httpStatus: event.status || null,
				headersMs: previous.headersMs ?? event.headersMs,
				totalMs: event.totalMs || null,
				error: event.message,
				notes: [...previous.notes, labels.error(event.message)].slice(-6),
			};
		default:
			return previous;
	}
}

export default function GatewayBenchmarkClient() {
	const t = useTranslations("Product.gatewayBenchmark");
	const [model, setModel] = useState("openai/gpt-5.4-nano");
	const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
	const [runs, setRuns] = useState("5");
	const [maxCompletionTokens, setMaxCompletionTokens] = useState("64");
	const [endpoint, setEndpoint] = useState<"chat_completions" | "responses">("chat_completions");
	const [gatewayBaseUrl, setGatewayBaseUrl] = useState("https://api.phaseo.app/v1");
	const [openRouterBaseUrl, setOpenRouterBaseUrl] = useState("https://openrouter.ai/api/v1");
	const [llmGatewayBaseUrl, setLlmGatewayBaseUrl] = useState("https://api.llmgateway.io/v1");
	const [vercelAiGatewayBaseUrl, setVercelAiGatewayBaseUrl] = useState("https://ai-gateway.vercel.sh/v1");
	const [data, setData] = useState<CompareResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isRunning, setIsRunning] = useState(false);
	const [isStreaming, setIsStreaming] = useState(false);
	const [isSummarizing, setIsSummarizing] = useState(false);
	const [livePanes, setLivePanes] = useState<Record<LiveTarget, LivePaneState>>({
		"phaseo": { ...EMPTY_LIVE_PANE },
		openrouter: { ...EMPTY_LIVE_PANE },
		llmgateway: { ...EMPTY_LIVE_PANE },
		"vercel-ai-gateway": { ...EMPTY_LIVE_PANE },
	});

	const phaseoSummary = getSummary(data, "phaseo");
	const openRouterSummary = getSummary(data, "openrouter");
	const llmGatewaySummary = getSummary(data, "llmgateway");
	const vercelAiGatewaySummary = getSummary(data, "vercel-ai-gateway");
	const maxValue = data ? maxTimelineValue(data.results) : 1;
	const liveEventLabels = {
		headers: (elapsed: string, status: number) => t("eventHeaders", { elapsed, status }),
		note: (elapsed: string, detail: string) => t("eventNote", { elapsed, detail }),
		done: (elapsed: string) => t("eventDone", { elapsed }),
		error: (message: string) => t("eventError", { message }),
	};

	const runSummary = async () => {
		setIsSummarizing(true);
		try {
			const payload = await fetchInternalWebApi<CompareResponse>("/api/internal/gateway-benchmark", (await getBrowserAccessToken()) ?? "", {
				method: "POST",
				body: JSON.stringify({
					model,
					prompt,
					runs: Number.parseInt(runs, 10),
					maxCompletionTokens: Number.parseInt(maxCompletionTokens, 10),
					endpoint,
					gatewayBaseUrl,
					openRouterBaseUrl,
					llmGatewayBaseUrl,
					vercelAiGatewayBaseUrl,
				}),
			});
			setData(payload);
		} catch {
			setData(null);
			setError(t("comparisonFailed"));
		} finally {
			setIsSummarizing(false);
		}
	};

	const runLiveCompare = async () => {
		setLivePanes({
			"phaseo": { ...EMPTY_LIVE_PANE },
			openrouter: { ...EMPTY_LIVE_PANE },
			llmgateway: { ...EMPTY_LIVE_PANE },
			"vercel-ai-gateway": { ...EMPTY_LIVE_PANE },
		});
		setIsStreaming(true);

		const response = await fetchInternalWebApiResponse("/api/internal/gateway-benchmark/live", (await getBrowserAccessToken()) ?? "", {
			method: "POST",
			body: JSON.stringify({
				model,
				prompt,
				maxCompletionTokens: Number.parseInt(maxCompletionTokens, 10),
				endpoint,
				gatewayBaseUrl,
				openRouterBaseUrl,
				llmGatewayBaseUrl,
				vercelAiGatewayBaseUrl,
			}),
		});

		if (!response.ok || !response.body) {
			throw new Error(t("liveComparisonFailed"));
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				const event = JSON.parse(trimmed) as LiveEvent;
				if (event.type === "fatal") {
					throw new Error(t("liveComparisonFailed"));
				}
				setLivePanes((previous) => ({
					...previous,
					[event.target]: applyLiveEvent(previous[event.target], event, liveEventLabels),
				}));
			}
		}
	};

	const runCompare = async () => {
		setError(null);
		setIsRunning(true);
		try {
			await runLiveCompare();
			await runSummary();
		} catch {
			setError(t("comparisonFailed"));
		} finally {
			setIsStreaming(false);
			setIsRunning(false);
		}
	};

	return (
		<div className="container mx-auto space-y-6 py-8">
			<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
				<div>
					<h1 className="text-2xl font-semibold">{t("title")}</h1>
					<p className="text-sm text-muted-foreground">
						{t("description")}
					</p>
					<p className="text-xs text-muted-foreground">
						{t("currentEndpoint")} {endpoint === "responses" ? "/responses" : "/chat/completions"}
					</p>
				</div>
				<div className="flex gap-2">
					<Link href="/internal" className="rounded-md border px-3 py-2 text-sm">
						{t("backToInternal")}
					</Link>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t("configurationTitle")}</CardTitle>
					<CardDescription>
						{t("configurationDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						<div className="space-y-2">
							<Label htmlFor="model">{t("model")}</Label>
							<Input id="model" value={model} onChange={(event) => setModel(event.target.value)} />
						</div>
						<div className="space-y-2">
							<Label htmlFor="runs">{t("runs")}</Label>
							<Input id="runs" inputMode="numeric" value={runs} onChange={(event) => setRuns(event.target.value)} />
						</div>
						<div className="space-y-2">
							<Label htmlFor="maxTokens">{t("maxCompletionTokens")}</Label>
							<Input
								id="maxTokens"
								inputMode="numeric"
								value={maxCompletionTokens}
								onChange={(event) => setMaxCompletionTokens(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label>{t("endpoint")}</Label>
							<div className="grid grid-cols-2 gap-2">
								<Button
									type="button"
									variant={endpoint === "chat_completions" ? "default" : "outline"}
									onClick={() => setEndpoint("chat_completions")}
								>
									{t("chatEndpoint")}
								</Button>
								<Button
									type="button"
									variant={endpoint === "responses" ? "default" : "outline"}
									onClick={() => setEndpoint("responses")}
								>
									{t("responsesEndpoint")}
								</Button>
							</div>
						</div>
						<div className="flex items-end">
							<Button onClick={runCompare} disabled={isRunning} className="w-full">
								{isRunning
									? isStreaming
										? t("streaming")
										: t("benchmarking")
									: t("runCompare")}
							</Button>
						</div>
					</div>

					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						<div className="space-y-2">
							<Label htmlFor="gatewayUrl">{t("gatewayBaseUrl")}</Label>
							<Input
								id="gatewayUrl"
								value={gatewayBaseUrl}
								onChange={(event) => setGatewayBaseUrl(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="openrouterUrl">{t("openRouterBaseUrl")}</Label>
							<Input
								id="openrouterUrl"
								value={openRouterBaseUrl}
								onChange={(event) => setOpenRouterBaseUrl(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="llmgatewayUrl">{t("llmGatewayBaseUrl")}</Label>
							<Input
								id="llmgatewayUrl"
								value={llmGatewayBaseUrl}
								onChange={(event) => setLlmGatewayBaseUrl(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="vercelGatewayUrl">{t("vercelAiGatewayBaseUrl")}</Label>
							<Input
								id="vercelGatewayUrl"
								value={vercelAiGatewayBaseUrl}
								onChange={(event) => setVercelAiGatewayBaseUrl(event.target.value)}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="prompt">{t("prompt")}</Label>
						<Textarea
							id="prompt"
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							className="min-h-[120px]"
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("liveTitle")}</CardTitle>
					<CardDescription>
						{t("liveDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 xl:grid-cols-4">
						<LiveStreamPane
							label="Phaseo Gateway"
							baseUrl={`${gatewayBaseUrl} ${endpoint === "responses" ? "/responses" : "/chat/completions"}`}
							state={livePanes["phaseo"]}
						/>
					<LiveStreamPane
						label="OpenRouter"
						baseUrl={`${openRouterBaseUrl} ${endpoint === "responses" ? "/responses" : "/chat/completions"}`}
						state={livePanes.openrouter}
					/>
						<LiveStreamPane
							label="LLMGateway"
							baseUrl={`${llmGatewayBaseUrl} ${endpoint === "responses" ? "/responses" : "/chat/completions"}`}
							state={livePanes.llmgateway}
						/>
						<LiveStreamPane
							label="Vercel AI Gateway"
							baseUrl={`${vercelAiGatewayBaseUrl} ${endpoint === "responses" ? "/responses" : "/chat/completions"}`}
							state={livePanes["vercel-ai-gateway"]}
						/>
					</div>
					<p className="text-xs text-muted-foreground">
							{t("externalGatewayPanes", {
								llmGatewayKey: "PERFORMANCE_KEY_LLMGATEWAY",
								llmGatewayApiKey: "LLM_GATEWAY_API_KEY",
								vercelGatewayKey: "PERFORMANCE_KEY_VERCEL_AI_GATEWAY",
								vercelGatewayApiKey: "VERCEL_AI_GATEWAY_API_KEY",
							})}
					</p>
				</CardContent>
			</Card>

			{error ? (
				<Alert variant="destructive">
					<AlertTitle>{t("benchmarkFailed")}</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			) : null}

			{data ? (
				<>
					<div className="grid gap-4 lg:grid-cols-4">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center justify-between">
									<span>Phaseo Gateway</span>
									<Badge variant="outline">{phaseoSummary?.successes ?? 0}/{data.config.runs} {t("statuses.ok")}</Badge>
								</CardTitle>
								<CardDescription>
									{data.config.gatewayBaseUrl}
									{" "}
									{data.config.endpoint === "responses" ? "/responses" : "/chat/completions"}
								</CardDescription>
							</CardHeader>
							<SummaryStats summary={phaseoSummary} />
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="flex items-center justify-between">
									<span>OpenRouter</span>
									<Badge variant="outline">{openRouterSummary?.successes ?? 0}/{data.config.runs} {t("statuses.ok")}</Badge>
								</CardTitle>
								<CardDescription>
									{data.config.openRouterBaseUrl}
									{" "}
									{data.config.endpoint === "responses" ? "/responses" : "/chat/completions"}
								</CardDescription>
							</CardHeader>
							<SummaryStats summary={openRouterSummary} />
						</Card>

						{llmGatewaySummary ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center justify-between">
										<span>LLMGateway</span>
										<Badge variant="outline">
											{llmGatewaySummary.successes ?? 0}/{data.config.runs} {t("statuses.ok")}
										</Badge>
									</CardTitle>
									<CardDescription>
										{data.config.llmGatewayBaseUrl}
										{" "}
										{data.config.endpoint === "responses" ? "/responses" : "/chat/completions"}
									</CardDescription>
								</CardHeader>
								<SummaryStats summary={llmGatewaySummary} />
							</Card>
						) : null}

						{vercelAiGatewaySummary ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center justify-between">
										<span>Vercel AI Gateway</span>
										<Badge variant="outline">
											{vercelAiGatewaySummary.successes ?? 0}/{data.config.runs} {t("statuses.ok")}
										</Badge>
									</CardTitle>
									<CardDescription>
										{data.config.vercelAiGatewayBaseUrl}
										{" "}
										{data.config.endpoint === "responses" ? "/responses" : "/chat/completions"}
									</CardDescription>
								</CardHeader>
								<SummaryStats summary={vercelAiGatewaySummary} />
							</Card>
						) : null}
					</div>

					{phaseoSummary?.stageSummary ? (
						<Card>
							<CardHeader>
								<CardTitle>{t("phaseoHeaderBreakdown")}</CardTitle>
								<CardDescription>
									{t("headerBreakdownDescription")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<GatewayStageTable summary={phaseoSummary.stageSummary} />
							</CardContent>
						</Card>
					) : null}

					<div className="grid gap-4">
						{Array.from({ length: data.config.runs }, (_, index) => index + 1).map((run) => {
							const phaseo = data.results.find((result) => result.target === "phaseo" && result.run === run);
							const openrouter = data.results.find((result) => result.target === "openrouter" && result.run === run);
							const llmgateway = data.results.find((result) => result.target === "llmgateway" && result.run === run);
							const vercelAiGateway = data.results.find(
								(result) => result.target === "vercel-ai-gateway" && result.run === run,
							);
							return (
								<Card key={run}>
									<CardHeader>
										<CardTitle>{t("runTitle", { run })}</CardTitle>
										<CardDescription>
											{t("runDescription")}
										</CardDescription>
									</CardHeader>
									<CardContent className="grid gap-6 xl:grid-cols-2">
										{[phaseo, openrouter, llmgateway, vercelAiGateway].map((result) =>
											result ? (
												<div key={`${result.target}-${run}`} className="space-y-4 rounded-lg border p-4">
													<div className="flex items-center justify-between">
                                                                                                <div className="font-medium">
                                                                                                        {targetLabel(result.target)}
                                                                                                </div>
														<Badge variant={result.ok ? "outline" : "destructive"}>
											{result.ok ? t("statuses.ok") : t("statuses.failed")}
														</Badge>
													</div>
													<div className="grid grid-cols-2 gap-3 text-sm">
									<div>{t("metrics.headers")}: {formatMs(result.headersMs, t("notAvailable"))}</div>
									<div>{t("metrics.firstByte")}: {formatMs(result.firstByteMs, t("notAvailable"))}</div>
									<div>{t("metrics.firstContent")}: {formatMs(result.firstContentMs, t("notAvailable"))}</div>
									<div>{t("metrics.total")}: {formatMs(result.totalMs, t("notAvailable"))}</div>
													</div>
													<Timeline result={result} maxValue={maxValue} />
													{result.target === "phaseo" ? (
														<GatewayStageTable breakdown={result.gatewayStageBreakdown} />
													) : null}
													<FramePreview result={result} />
													{result.error ? (
														<div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
															{result.error}
														</div>
													) : null}
												</div>
											) : null,
										)}
									</CardContent>
								</Card>
							);
						})}
					</div>
				</>
			) : (
				<Card>
					<CardContent className="py-10 text-sm text-muted-foreground">
						{isSummarizing ? t("refreshingAggregate") : t("runToPopulate")}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
