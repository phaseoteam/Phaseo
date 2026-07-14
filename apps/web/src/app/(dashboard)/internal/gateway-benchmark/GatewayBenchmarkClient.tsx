"use client";

import Link from "next/link";
import { useState } from "react";
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

function formatMs(value: number | null | undefined) {
	return typeof value === "number" ? `${value.toFixed(1)} ms` : "n/a";
}

function formatStats(stats: Stats | null) {
	if (!stats) return "n/a";
	return `p50 ${stats.p50.toFixed(1)} ms | avg ${stats.avg.toFixed(1)} ms`;
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

function formatCompactStats(stats: Stats | null) {
	if (!stats) return "n/a";
	return `${stats.avg.toFixed(1)} avg`;
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
	const bars = [
		{ label: "Headers", value: result.headersMs, color: "bg-slate-500" },
		{ label: "First byte", value: result.firstByteMs ?? 0, color: "bg-sky-500" },
		{ label: "First content", value: result.firstContentMs ?? 0, color: "bg-emerald-500" },
		{ label: "Total", value: result.totalMs, color: "bg-amber-500" },
	];

	return (
		<div className="space-y-2">
			{bars.map((bar) => (
				<div key={bar.label} className="space-y-1">
					<div className="flex items-center justify-between text-xs text-muted-foreground">
						<span>{bar.label}</span>
						<span>{bar.value.toFixed(1)} ms</span>
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
	return (
		<div className="space-y-2">
			{result.firstFrames.slice(0, 4).map((frame, index) => (
				<div key={`${result.target}-${result.run}-${index}`} className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
					<div className="font-medium text-foreground">
						{frame.atMs.toFixed(1)} ms | {frame.event ?? frame.object ?? frame.type ?? frame.dataKind}
					</div>
					<div className="text-muted-foreground">
						{frame.hasContent ? `content ${frame.contentLength} chars` : "no content"}
						{frame.hasUsage ? " | usage" : ""}
						{frame.isDone ? " | done" : ""}
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
	const rows = summary
		? [
				{ label: "Before", value: summary.beforeMs },
				{ label: "Protocol", value: summary.protocolDetectMs },
				{ label: "IR decode", value: summary.irDecodeMs },
				{ label: "Candidates", value: summary.executeGuardCandidatesMs },
				{ label: "Modalities", value: summary.executeFilterModalitiesMs },
				{ label: "Rank", value: summary.executeRankProvidersMs },
				{ label: "Breaker", value: summary.attemptBreakerMs },
				{ label: "Price card", value: summary.attemptLoadPricecardMs },
				{ label: "Resolve executor", value: summary.attemptResolveExecutorMs },
				{ label: "Normalize IR", value: summary.attemptNormalizeIrMs },
				{ label: "Request build", value: summary.attemptRequestBuildMs },
				{ label: "Upstream headers", value: summary.attemptUpstreamHeadersMs },
				{ label: "Headers->first byte", value: summary.headersToFirstByteMs },
				{ label: "Headers->content", value: summary.headersToFirstContentMs },
				{ label: "Accounted headers", value: summary.accountedHeadersMs },
				{ label: "Unaccounted headers", value: summary.unaccountedHeadersMs },
			]
		: breakdown
			? [
					{ label: "Before", value: breakdown.beforeMs },
					{ label: "Protocol", value: breakdown.protocolDetectMs },
					{ label: "IR decode", value: breakdown.irDecodeMs },
					{ label: "Candidates", value: breakdown.executeGuardCandidatesMs },
					{ label: "Modalities", value: breakdown.executeFilterModalitiesMs },
					{ label: "Rank", value: breakdown.executeRankProvidersMs },
					{ label: "Breaker", value: breakdown.attemptBreakerMs },
					{ label: "Price card", value: breakdown.attemptLoadPricecardMs },
					{ label: "Resolve executor", value: breakdown.attemptResolveExecutorMs },
					{ label: "Normalize IR", value: breakdown.attemptNormalizeIrMs },
					{ label: "Request build", value: breakdown.attemptRequestBuildMs },
					{ label: "Upstream headers", value: breakdown.attemptUpstreamHeadersMs },
					{ label: "Headers->first byte", value: breakdown.headersToFirstByteMs },
					{ label: "Headers->content", value: breakdown.headersToFirstContentMs },
					{ label: "Accounted headers", value: breakdown.accountedHeadersMs },
					{ label: "Unaccounted headers", value: breakdown.unaccountedHeadersMs },
				]
			: [];

	if (!rows.length) return null;

	return (
		<div className="grid gap-2 sm:grid-cols-2">
			{rows.map((row) => (
				<div key={row.label} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-xs">
					<span className="text-muted-foreground">{row.label}</span>
					<span className="font-medium text-foreground">
						{summary ? formatCompactStats(row.value as Stats | null) : formatMs(row.value as number | null)}
					</span>
				</div>
			))}
		</div>
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
	return (
		<Card className="h-full">
			<CardHeader>
				<CardTitle className="flex items-center justify-between">
					<span>{label}</span>
					<Badge variant={liveBadgeVariant(state.status)}>{state.status}</Badge>
				</CardTitle>
				<CardDescription>{baseUrl}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-3 gap-3 text-xs">
					<div className="rounded-md border bg-muted/20 px-3 py-2">
						<div className="text-muted-foreground">Headers</div>
						<div className="font-medium">{formatMs(state.headersMs)}</div>
					</div>
					<div className="rounded-md border bg-muted/20 px-3 py-2">
						<div className="text-muted-foreground">First content</div>
						<div className="font-medium">{formatMs(state.firstContentMs)}</div>
					</div>
					<div className="rounded-md border bg-muted/20 px-3 py-2">
						<div className="text-muted-foreground">Total</div>
						<div className="font-medium">{formatMs(state.totalMs)}</div>
					</div>
				</div>

				<div className="rounded-lg border bg-black px-4 py-3">
					<div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-zinc-400">
						<span>Live stream</span>
						<span>{state.httpStatus ? `HTTP ${state.httpStatus}` : "connecting"}</span>
					</div>
					<div className="h-64 overflow-y-auto whitespace-pre-wrap font-mono text-sm leading-6 text-zinc-100">
						{state.text || <span className="text-zinc-500">Waiting for content...</span>}
					</div>
				</div>

				<div className="space-y-2">
					<div className="text-xs font-medium text-muted-foreground">Live event log</div>
					<div className="space-y-2">
						{state.notes.length ? (
							state.notes.map((note, index) => (
								<div key={`${label}-${index}`} className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
									{note}
								</div>
							))
						) : (
							<div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
								No stream events yet.
							</div>
						)}
					</div>
				</div>

				{state.error ? (
					<div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
						{state.error}
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function applyLiveEvent(previous: LivePaneState, event: LiveEvent): LivePaneState {
	switch (event.type) {
		case "started":
			return { ...previous, status: "connecting" };
		case "headers":
			return {
				...previous,
				status: "streaming",
				httpStatus: event.status,
				headersMs: event.headersMs,
				notes: [...previous.notes, `headers ${event.headersMs.toFixed(1)} ms | HTTP ${event.status}`].slice(-6),
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
				notes: [...previous.notes, `${event.atMs.toFixed(1)} ms | ${event.text}`].slice(-6),
			};
		case "done":
			return {
				...previous,
				status: "done",
				httpStatus: event.status,
				totalMs: event.totalMs,
				firstContentMs: previous.firstContentMs ?? event.firstContentMs,
				notes: [...previous.notes, `done ${event.totalMs.toFixed(1)} ms`].slice(-6),
			};
		case "error":
			return {
				...previous,
				status: "error",
				httpStatus: event.status || null,
				headersMs: previous.headersMs ?? event.headersMs,
				totalMs: event.totalMs || null,
				error: event.message,
				notes: [...previous.notes, `error | ${event.message}`].slice(-6),
			};
		default:
			return previous;
	}
}

export default function GatewayBenchmarkClient() {
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

	const runSummary = async () => {
		setIsSummarizing(true);
		try {
			const response = await fetch("/api/internal/gateway-benchmark", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
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
			const payload = (await response.json()) as CompareResponse & {
				error?: string;
				details?: string;
			};
			if (!response.ok) {
				setData(null);
				setError(payload.details ?? payload.error ?? "Failed to run comparison");
				return;
			}
			setData(payload);
		} catch (requestError) {
			setData(null);
			setError(
				requestError instanceof Error
					? requestError.message
					: "Failed to run comparison",
			);
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

		const response = await fetch("/api/internal/gateway-benchmark/live", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
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
			const payload = (await response.json().catch(() => null)) as { error?: string; details?: string } | null;
			throw new Error(payload?.details ?? payload?.error ?? "Failed to start live comparison");
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
					throw new Error(event.message);
				}
				setLivePanes((previous) => ({
					...previous,
					[event.target]: applyLiveEvent(previous[event.target], event),
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
		} catch (requestError) {
			setError(
				requestError instanceof Error
					? requestError.message
					: "Failed to run comparison",
			);
		} finally {
			setIsStreaming(false);
			setIsRunning(false);
		}
	};

	return (
		<div className="container mx-auto space-y-6 py-8">
			<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Gateway Benchmark</h1>
					<p className="text-sm text-muted-foreground">
						Public client-visible compare view for Phaseo Gateway vs OpenRouter, LLMGateway, and Vercel AI Gateway.
					</p>
					<p className="text-xs text-muted-foreground">
						Current endpoint: {endpoint === "responses" ? "/responses" : "/chat/completions"}
					</p>
				</div>
				<div className="flex gap-2">
					<Link href="/internal" className="rounded-md border px-3 py-2 text-sm">
						Back to Internal
					</Link>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Run configuration</CardTitle>
					<CardDescription>
						The page starts one live side-by-side stream first, then refreshes the aggregate benchmark below.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						<div className="space-y-2">
							<Label htmlFor="model">Model</Label>
							<Input id="model" value={model} onChange={(event) => setModel(event.target.value)} />
						</div>
						<div className="space-y-2">
							<Label htmlFor="runs">Runs</Label>
							<Input id="runs" inputMode="numeric" value={runs} onChange={(event) => setRuns(event.target.value)} />
						</div>
						<div className="space-y-2">
							<Label htmlFor="maxTokens">Max completion tokens</Label>
							<Input
								id="maxTokens"
								inputMode="numeric"
								value={maxCompletionTokens}
								onChange={(event) => setMaxCompletionTokens(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label>Endpoint</Label>
							<div className="grid grid-cols-2 gap-2">
								<Button
									type="button"
									variant={endpoint === "chat_completions" ? "default" : "outline"}
									onClick={() => setEndpoint("chat_completions")}
								>
									Chat
								</Button>
								<Button
									type="button"
									variant={endpoint === "responses" ? "default" : "outline"}
									onClick={() => setEndpoint("responses")}
								>
									Responses
								</Button>
							</div>
						</div>
						<div className="flex items-end">
							<Button onClick={runCompare} disabled={isRunning} className="w-full">
								{isRunning ? (isStreaming ? "Streaming..." : "Benchmarking...") : "Run Compare"}
							</Button>
						</div>
					</div>

					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						<div className="space-y-2">
							<Label htmlFor="gatewayUrl">Gateway base URL</Label>
							<Input
								id="gatewayUrl"
								value={gatewayBaseUrl}
								onChange={(event) => setGatewayBaseUrl(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="openrouterUrl">OpenRouter base URL</Label>
							<Input
								id="openrouterUrl"
								value={openRouterBaseUrl}
								onChange={(event) => setOpenRouterBaseUrl(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="llmgatewayUrl">LLMGateway base URL</Label>
							<Input
								id="llmgatewayUrl"
								value={llmGatewayBaseUrl}
								onChange={(event) => setLlmGatewayBaseUrl(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="vercelGatewayUrl">Vercel AI Gateway base URL</Label>
							<Input
								id="vercelGatewayUrl"
								value={vercelAiGatewayBaseUrl}
								onChange={(event) => setVercelAiGatewayBaseUrl(event.target.value)}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="prompt">Prompt</Label>
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
					<CardTitle>Live Side-by-Side Stream</CardTitle>
					<CardDescription>
						Both upstream requests start together. This view shows the content arriving in real time on each side.
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
						The external-gateway panes appear when their benchmark keys are configured: `PERFORMANCE_KEY_LLMGATEWAY` or `LLM_GATEWAY_API_KEY`, and `PERFORMANCE_KEY_VERCEL_AI_GATEWAY` or `VERCEL_AI_GATEWAY_API_KEY`.
					</p>
				</CardContent>
			</Card>

			{error ? (
				<Alert variant="destructive">
					<AlertTitle>Benchmark failed</AlertTitle>
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
									<Badge variant="outline">{phaseoSummary?.successes ?? 0}/{data.config.runs} ok</Badge>
								</CardTitle>
								<CardDescription>
									{data.config.gatewayBaseUrl}
									{" "}
									{data.config.endpoint === "responses" ? "/responses" : "/chat/completions"}
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-2 text-sm">
								<div>Headers: {formatStats(phaseoSummary?.headersMs ?? null)}</div>
								<div>First byte: {formatStats(phaseoSummary?.firstByteMs ?? null)}</div>
								<div>First content: {formatStats(phaseoSummary?.firstContentMs ?? null)}</div>
								<div>Total: {formatStats(phaseoSummary?.totalMs ?? null)}</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="flex items-center justify-between">
									<span>OpenRouter</span>
									<Badge variant="outline">{openRouterSummary?.successes ?? 0}/{data.config.runs} ok</Badge>
								</CardTitle>
								<CardDescription>
									{data.config.openRouterBaseUrl}
									{" "}
									{data.config.endpoint === "responses" ? "/responses" : "/chat/completions"}
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-2 text-sm">
								<div>Headers: {formatStats(openRouterSummary?.headersMs ?? null)}</div>
								<div>First byte: {formatStats(openRouterSummary?.firstByteMs ?? null)}</div>
								<div>First content: {formatStats(openRouterSummary?.firstContentMs ?? null)}</div>
								<div>Total: {formatStats(openRouterSummary?.totalMs ?? null)}</div>
							</CardContent>
						</Card>

						{llmGatewaySummary ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center justify-between">
										<span>LLMGateway</span>
										<Badge variant="outline">
											{llmGatewaySummary.successes ?? 0}/{data.config.runs} ok
										</Badge>
									</CardTitle>
									<CardDescription>
										{data.config.llmGatewayBaseUrl}
										{" "}
										{data.config.endpoint === "responses" ? "/responses" : "/chat/completions"}
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-2 text-sm">
									<div>Headers: {formatStats(llmGatewaySummary.headersMs ?? null)}</div>
									<div>First byte: {formatStats(llmGatewaySummary.firstByteMs ?? null)}</div>
									<div>First content: {formatStats(llmGatewaySummary.firstContentMs ?? null)}</div>
									<div>Total: {formatStats(llmGatewaySummary.totalMs ?? null)}</div>
								</CardContent>
							</Card>
						) : null}

						{vercelAiGatewaySummary ? (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center justify-between">
										<span>Vercel AI Gateway</span>
										<Badge variant="outline">
											{vercelAiGatewaySummary.successes ?? 0}/{data.config.runs} ok
										</Badge>
									</CardTitle>
									<CardDescription>
										{data.config.vercelAiGatewayBaseUrl}
										{" "}
										{data.config.endpoint === "responses" ? "/responses" : "/chat/completions"}
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-2 text-sm">
									<div>Headers: {formatStats(vercelAiGatewaySummary.headersMs ?? null)}</div>
									<div>First byte: {formatStats(vercelAiGatewaySummary.firstByteMs ?? null)}</div>
									<div>First content: {formatStats(vercelAiGatewaySummary.firstContentMs ?? null)}</div>
									<div>Total: {formatStats(vercelAiGatewaySummary.totalMs ?? null)}</div>
								</CardContent>
							</Card>
						) : null}
					</div>

					{phaseoSummary?.stageSummary ? (
						<Card>
							<CardHeader>
								<CardTitle>Phaseo Header Breakdown</CardTitle>
								<CardDescription>
									Public `Server-Timing` spans plus the browser-observed post-header wait.
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
										<CardTitle>Run {run}</CardTitle>
										<CardDescription>
											Visual compare of public milestones and first returned frames.
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
															{result.ok ? "ok" : "failed"}
														</Badge>
													</div>
													<div className="grid grid-cols-2 gap-3 text-sm">
														<div>Headers: {formatMs(result.headersMs)}</div>
														<div>First byte: {formatMs(result.firstByteMs)}</div>
														<div>First content: {formatMs(result.firstContentMs)}</div>
														<div>Total: {formatMs(result.totalMs)}</div>
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
						{isSummarizing ? "Refreshing aggregate benchmark..." : "Run a compare to populate the aggregate benchmark cards."}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
