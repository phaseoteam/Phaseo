"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Square, Zap, Server, Loader2, BarChart3, TrendingUp, Download, Save, Trash2, Plus, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

type RequestState = "idle" | "running" | "completed" | "error";

interface TimingResult {
	ttft: number | null;
	totalTime: number;
	chunks: number;
	firstChunkAt: number | null;
	completedAt: number | null;
	error: string | null;
	firstTokenTime: number | null;
	throughput: number | null;
}

interface RunResult {
	runNumber: number;
	gateway: TimingResult;
	openai: TimingResult;
	gatewayWinner: "gateway" | "openai" | null;
	difference: number;
	prompt: string;
}

interface RequestConfig {
	url: string;
	apiKey: string;
	model: string;
	prompt: string;
	errorMessage: string;
}

interface SavedConfig {
	id: string;
	name: string;
	gatewayUrl: string;
	prompts: string[];
	numRuns: number;
	createdAt: number;
}

function formatTime(ms: number | null, notAvailable: string): string {
	if (ms === null || ms === undefined) return notAvailable;
	if (ms < 1000) return `${ms.toFixed(0)}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
	return `${(ms / 1000).toFixed(2)}s`;
}

async function streamRequest(
	config: RequestConfig,
	onChunk: (chunk: string, isFirst: boolean, timestamp: number) => void,
	onComplete: (result: TimingResult) => void,
	onError: (error: string) => void
): Promise<void> {
	const startTime = performance.now();
	let firstChunkReceived = false;
	let firstChunkTime = 0;
	let chunks = 0;
	let gatewayThroughput: number | null = null;
	const decoder = new TextDecoder();

	try {
		const response = await fetch(`${config.url}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${config.apiKey}`,
			},
			body: JSON.stringify({
				model: config.model,
				messages: [{ role: "user", content: config.prompt }],
				stream: true,
				meta: true,
			}),
		});

		if (!response.ok) throw new Error(config.errorMessage);

		if (!response.body) {
			throw new Error(config.errorMessage);
		}

		const reader = response.body.getReader();
		let buffer = "";

		while (true) {
			const { value, done } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const frames = buffer.split(/\r?\n\r?\n/);
			buffer = frames.pop() ?? "";

			for (const frame of frames) {
				const lines = frame.split(/\r?\n/);
				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed.startsWith("data:")) continue;
					const data = trimmed.slice(5).trim();
					if (!data || data === "[DONE]") continue;

					try {
						const parsed = JSON.parse(data);
						const content = parsed.choices?.[0]?.delta?.content || "";
						if (content) {
							const currentTime = performance.now();
							chunks++;
							const isFirst = !firstChunkReceived;
							if (isFirst) {
								firstChunkReceived = true;
								firstChunkTime = currentTime - startTime;
							}
							onChunk(content, isFirst, currentTime - startTime);
						}
						const metaThroughput = parsed?.meta?.throughput ?? parsed?.response?.meta?.throughput ?? null;
						if (metaThroughput !== null && gatewayThroughput === null) {
							gatewayThroughput = metaThroughput;
						}
					} catch {
						continue;
					}
				}
			}
		}

		const totalTime = performance.now() - startTime;
		const streamingTime = firstChunkTime > 0 ? totalTime - firstChunkTime : 0;
		const calculatedThroughput = chunks > 0 && streamingTime > 0 ? chunks / (streamingTime / 1000) : null;
		const finalThroughput = gatewayThroughput !== null ? gatewayThroughput : calculatedThroughput;

		onComplete({
			ttft: firstChunkTime,
			totalTime,
			chunks,
			firstChunkAt: firstChunkTime,
			completedAt: totalTime,
			error: null,
			firstTokenTime: firstChunkTime,
			throughput: finalThroughput,
		});
	} catch {
		const errorMessage = config.errorMessage;
		onError(errorMessage);
		onComplete({
			ttft: null,
			totalTime: performance.now() - startTime,
			chunks,
			firstChunkAt: null,
			completedAt: null,
			error: errorMessage,
			firstTokenTime: null,
			throughput: null,
		});
	}
}

function OpenAIStreamRequest(
	config: RequestConfig,
	onChunk: (chunk: string, isFirst: boolean, timestamp: number) => void,
	onComplete: (result: TimingResult) => void,
	onError: (error: string) => void
): Promise<void> {
	return new Promise((resolve) => {
		const startTime = performance.now();
		let firstChunkReceived = false;
		let firstChunkTime = 0;
		let chunks = 0;
		let completionTokens = 0;
		const decoder = new TextDecoder();

		fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${config.apiKey}`,
			},
			body: JSON.stringify({
				model: config.model,
				messages: [{ role: "user", content: config.prompt }],
				stream: true,
			}),
		})
			.then(async (response) => {
				if (!response.ok) throw new Error(config.errorMessage);

				if (!response.body) {
					throw new Error(config.errorMessage);
				}

				const reader = response.body.getReader();

				const readLoop = async (): Promise<void> => {
					const { value, done } = await reader.read();
					if (done) {
						const totalTime = performance.now() - startTime;
						const generationTime = firstChunkTime > 0 ? totalTime - firstChunkTime : 0;
						const throughput = completionTokens > 0 && generationTime > 0 ? completionTokens / (generationTime / 1000) : null;

						onComplete({
							ttft: firstChunkTime,
							totalTime,
							chunks,
							firstChunkAt: firstChunkTime,
							completedAt: totalTime,
							error: null,
							firstTokenTime: firstChunkTime,
							throughput,
						});
						resolve();
						return;
					}

					buffer += decoder.decode(value, { stream: true });
					const frames = buffer.split(/\r?\n\r?\n/);
					buffer = frames.pop() ?? "";

					for (const frame of frames) {
						const lines = frame.split(/\r?\n/);
						for (const line of lines) {
							const trimmed = line.trim();
							if (!trimmed.startsWith("data:")) continue;
							const data = trimmed.slice(5).trim();
							if (!data || data === "[DONE]") continue;

							try {
								const parsed = JSON.parse(data);
								const content = parsed.choices?.[0]?.delta?.content || "";
								if (content) {
									const currentTime = performance.now();
									chunks++;
									const isFirst = !firstChunkReceived;
									if (isFirst) {
										firstChunkReceived = true;
										firstChunkTime = currentTime - startTime;
									}
									onChunk(content, isFirst, currentTime - startTime);
								}
								const usage = parsed?.usage ?? parsed?.response?.usage;
								if (usage?.completion_tokens) {
									completionTokens = usage.completion_tokens;
								}
							} catch {
								continue;
							}
						}
					}

					return readLoop();
				};

				let buffer = "";
				return readLoop();
			})
			.catch(() => {
				const errorMessage = config.errorMessage;
				onError(errorMessage);
				const totalTime = performance.now() - startTime;
				onComplete({
					ttft: null,
					totalTime,
					chunks,
					firstChunkAt: null,
					completedAt: null,
					error: errorMessage,
					firstTokenTime: null,
					throughput: null,
				});
				resolve();
			});
	});
}

function calculateStats(times: number[]): { avg: number; min: number; max: number; median: number; stdDev: number } {
	if (times.length === 0) {
		return { avg: 0, min: 0, max: 0, median: 0, stdDev: 0 };
	}
	const sorted = [...times].sort((a, b) => a - b);
	const sum = times.reduce((a, b) => a + b, 0);
	const avg = sum / times.length;
	const squaredDiffs = times.map((t) => Math.pow(t - avg, 2));
	const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / times.length;
	return {
		avg,
		min: sorted[0],
		max: sorted[sorted.length - 1],
		median: sorted[Math.floor(sorted.length / 2)],
		stdDev: Math.sqrt(avgSquaredDiff),
	};
}

function calculateDifferenceStats(results: RunResult[]): { avgDiff: number; medianDiff: number; gatewayFasterPct: number } {
	const validDiffs = results.filter((r) => r.gatewayWinner !== null && r.difference > 0);
	if (validDiffs.length === 0) {
		return { avgDiff: 0, medianDiff: 0, gatewayFasterPct: 0 };
	}
	const diffs = validDiffs.map((r) => r.difference);
	const sorted = [...diffs].sort((a, b) => a - b);
	const sum = diffs.reduce((a, b) => a + b, 0);
	const gatewayFaster = validDiffs.filter((r) => r.gatewayWinner === "gateway").length;
	return {
		avgDiff: sum / diffs.length,
		medianDiff: sorted[Math.floor(sorted.length / 2)],
		gatewayFasterPct: (gatewayFaster / validDiffs.length) * 100,
	};
}

function exportToCSV(results: RunResult[]): string {
	const headers = ["Run", "Prompt", "Gateway TTFT", "Gateway Total", "Gateway Chunks", "Gateway Throughput", "OpenAI TTFT", "OpenAI Total", "OpenAI Chunks", "OpenAI Throughput", "Winner", "Difference"];
	const rows = results.map((r) => [
		r.runNumber,
		`"${r.prompt.replace(/"/g, '""')}"`,
		r.gateway.ttft !== null ? r.gateway.ttft.toFixed(0) : "N/A",
		r.gateway.totalTime.toFixed(0),
		r.gateway.chunks,
		r.gateway.throughput !== null ? r.gateway.throughput.toFixed(2) : "N/A",
		r.openai.ttft !== null ? r.openai.ttft.toFixed(0) : "N/A",
		r.openai.totalTime.toFixed(0),
		r.openai.chunks,
		r.openai.throughput !== null ? r.openai.throughput.toFixed(2) : "N/A",
		r.gatewayWinner || "Tie",
		r.difference.toFixed(0),
	]);
	return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function exportToJSON(results: RunResult[]): string {
	return JSON.stringify(results, null, 2);
}

function TimelineChart({ gatewayTimes, openaiTimes }: { gatewayTimes: number[]; openaiTimes: number[] }) {
	const t = useTranslations("Product.latency");
	const maxTime = Math.max(...gatewayTimes, ...openaiTimes, 1);
	const width = 400;
	const height = 100;
	const padding = 20;
	const chartWidth = width - padding * 2;
	const chartHeight = height - padding * 2;

	const getX = (index: number, total: number) => padding + (index / (total - 1 || 1)) * chartWidth;
	const getY = (time: number) => padding + (1 - time / maxTime) * chartHeight;

	const allTimes = [...gatewayTimes, ...openaiTimes];

	if (allTimes.length === 0) {
		return (
			<svg width={width} height={height} className="w-full h-24">
				<text x={width / 2} y={height / 2} textAnchor="middle" className="text-sm fill-muted-foreground">
					{t("noData")}
				</text>
			</svg>
		);
	}

	const gatewayPoints = gatewayTimes.map((t, i) => `${getX(i, gatewayTimes.length)},${getY(t)}`).join(" ");
	const openaiPoints = openaiTimes.map((t, i) => `${getX(i, openaiTimes.length)},${getY(t)}`).join(" ");

	return (
		<svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full h-24">
			<line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="currentColor" strokeOpacity={0.2} />
			<line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="currentColor" strokeOpacity={0.2} />
			{gatewayTimes.length > 1 && (
				<polyline fill="none" stroke="#22c55e" strokeWidth={2} points={gatewayPoints} />
			)}
			{openaiTimes.length > 1 && (
				<polyline fill="none" stroke="#3b82f6" strokeWidth={2} points={openaiPoints} />
			)}
			{gatewayTimes.map((t, i) => (
				<circle key={`gw-${i}`} cx={getX(i, gatewayTimes.length)} cy={getY(t)} r={3} fill="#22c55e" />
			))}
			{openaiTimes.map((t, i) => (
				<circle key={`openai-${i}`} cx={getX(i, openaiTimes.length)} cy={getY(t)} r={3} fill="#3b82f6" />
			))}
			<text x={padding} y={padding - 5} className="text-xs fill-muted-foreground">{formatTime(maxTime, t("nA"))}</text>
			<text x={padding} y={height - 5} className="text-xs fill-muted-foreground">0</text>
			<g className="flex justify-between text-xs">
				<text x={padding} y={height - 5} className="fill-muted-foreground">
					{t("runNumber", { number: 1 })}
				</text>
				<text x={width - padding} y={height - 5} className="fill-muted-foreground">
					{t("runNumber", { number: gatewayTimes.length })}
				</text>
			</g>
		</svg>
	);
}

export default function LatencyComparisonClient() {
	const t = useTranslations("Product.latency");
	const extrasT = useTranslations("Product.latencyExtras");
	const formatLocalizedTime = (ms: number | null) => formatTime(ms, t("nA"));
	const displayFormat = useDisplayFormatters();
	const formatNumber = (value: number, decimals = 2) =>
		displayFormat.number(value, {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
		});
	const [gatewayUrl, setGatewayUrl] = useState("");
	const [gatewayApiKey, setGatewayApiKey] = useState("");
	const [openaiApiKey, setOpenaiApiKey] = useState("");
	const [prompts, setPrompts] = useState<string[]>([t("defaultPrompt")]);
	const [numRuns, setNumRuns] = useState(3);

	const gatewayModel = "openai/gpt-5-nano";
	const openaiModel = "gpt-5-nano";

	const [gatewayState, setGatewayState] = useState<RequestState>("idle");
	const [openaiState, setOpenaiState] = useState<RequestState>("idle");

	const [gatewayResult, setGatewayResult] = useState<TimingResult | null>(null);
	const [openaiResult, setOpenaiResult] = useState<TimingResult | null>(null);

	const [gatewayContent, setGatewayContent] = useState("");
	const [openaiContent, setOpenaiContent] = useState("");

	const [elapsedTime, setElapsedTime] = useState(0);
	const timerRef = useRef<NodeJS.Timeout | null>(null);
	const startTimeRef = useRef<number | null>(null);

	const [isRunning, setIsRunning] = useState(false);
	const [currentRun, setCurrentRun] = useState(0);
	const [totalRuns, setTotalRuns] = useState(0);
	const [runResults, setRunResults] = useState<RunResult[]>([]);
	const [showAllRuns, setShowAllRuns] = useState(false);
	const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
	const [configName, setConfigName] = useState("");
	const [showSaveDialog, setShowSaveDialog] = useState(false);

	useEffect(() => {
		const saved = localStorage.getItem("latency-comparison-configs");
		if (saved) {
			try {
				const parsed = JSON.parse(saved) as SavedConfig[];
				const sanitized = parsed.map((config) => ({
					id: config.id,
					name: config.name,
					gatewayUrl: config.gatewayUrl,
					prompts: config.prompts,
					numRuns: config.numRuns,
					createdAt: config.createdAt,
				}));
				setSavedConfigs(sanitized);
				// Remove credentials persisted by versions before this security fix.
				localStorage.setItem("latency-comparison-configs", JSON.stringify(sanitized));
			} catch {
				// Ignore
			}
		}
	}, []);

	const startTimer = useCallback(() => {
		startTimeRef.current = performance.now();
		setElapsedTime(0);
		setIsRunning(true);
	}, []);

	const stopTimer = useCallback(() => {
		setIsRunning(false);
		if (timerRef.current) {
			clearInterval(timerRef.current);
		}
	}, []);

	useEffect(() => {
		if (isRunning && startTimeRef.current !== null) {
			timerRef.current = setInterval(() => {
				setElapsedTime(performance.now() - startTimeRef.current!);
			}, 50);
		}

		return () => {
			if (timerRef.current) {
				clearInterval(timerRef.current);
			}
		};
	}, [isRunning]);

	const addPrompt = () => {
		setPrompts([...prompts, t("addedPromptDefault")]);
	};

	const removePrompt = (index: number) => {
		if (prompts.length > 1) {
			setPrompts(prompts.filter((_, i) => i !== index));
		}
	};

	const updatePrompt = (index: number, value: string) => {
		const newPrompts = [...prompts];
		newPrompts[index] = value;
		setPrompts(newPrompts);
	};

	const saveConfig = () => {
		if (!configName.trim()) return;
		const config: SavedConfig = {
			id: Date.now().toString(),
			name: configName,
			gatewayUrl,
			prompts: [...prompts],
			numRuns,
			createdAt: Date.now(),
		};
		const newConfigs = [...savedConfigs, config];
		setSavedConfigs(newConfigs);
		localStorage.setItem("latency-comparison-configs", JSON.stringify(newConfigs));
		setConfigName("");
		setShowSaveDialog(false);
	};

	const loadConfig = (config: SavedConfig) => {
		setGatewayUrl(config.gatewayUrl);
		setPrompts(config.prompts.length > 0 ? config.prompts : [t("defaultPrompt")]);
		setNumRuns(config.numRuns);
	};

	const deleteConfig = (id: string) => {
		const newConfigs = savedConfigs.filter((c) => c.id !== id);
		setSavedConfigs(newConfigs);
		localStorage.setItem("latency-comparison-configs", JSON.stringify(newConfigs));
	};

	const handleRun = useCallback(async () => {
		if (!gatewayUrl || !gatewayApiKey || !openaiApiKey) {
			alert(t("missingCredentials"));
			return;
		}

		stopTimer();
		setRunResults([]);
		const totalRunsCount = prompts.length * numRuns;
		setTotalRuns(totalRunsCount);

		startTimer();

		const results: RunResult[] = [];
		let runNumber = 1;

		for (let p = 0; p < prompts.length; p++) {
			const prompt = prompts[p];

			for (let i = 0; i < numRuns; i++) {
				setCurrentRun(runNumber);
				setGatewayState("running");
				setOpenaiState("running");
				setGatewayContent("");
				setOpenaiContent("");

				startTimeRef.current = performance.now();
				setElapsedTime(0);

				const config: RequestConfig = {
					url: gatewayUrl.replace(/\/+$/, ""),
					apiKey: gatewayApiKey,
					model: gatewayModel,
					prompt,
					errorMessage: t("requestFailed"),
				};

				const openaiConfig: RequestConfig = {
					url: "https://api.openai.com",
					apiKey: openaiApiKey,
					model: openaiModel,
					prompt,
					errorMessage: t("requestFailed"),
				};

				let gatewayRes: TimingResult | null = null;
				let openaiRes: TimingResult | null = null;

				await Promise.all([
					new Promise<void>((resolve) => {
						streamRequest(
							config,
							(chunk) => {
								setGatewayContent((prev) => prev + chunk);
							},
							(result) => {
								gatewayRes = result;
								setGatewayResult(result);
								setGatewayState(result.error ? "error" : "completed");
								resolve();
							},
							() => {
								setGatewayState("error");
								resolve();
							}
						);
					}),
					new Promise<void>((resolve) => {
						OpenAIStreamRequest(
							openaiConfig,
							(chunk) => {
								setOpenaiContent((prev) => prev + chunk);
							},
							(result) => {
								openaiRes = result;
								setOpenaiResult(result);
								setOpenaiState(result.error ? "error" : "completed");
								resolve();
							},
							() => {
								setOpenaiState("error");
								resolve();
							}
						);
					}),
				]);

				const finalGateway = gatewayRes!;
				const finalOpenai = openaiRes!;

				const winner =
					finalGateway && finalOpenai && !finalGateway.error && !finalOpenai.error
						? finalGateway.totalTime < finalOpenai.totalTime
							? "gateway"
							: finalOpenai.totalTime < finalGateway.totalTime
								? "openai"
								: null
						: null;

				const diff =
					finalGateway && finalOpenai && !finalGateway.error && !finalOpenai.error
						? Math.abs(finalGateway.totalTime - finalOpenai.totalTime)
						: 0;

				results.push({
					runNumber,
					gateway: finalGateway,
					openai: finalOpenai,
					gatewayWinner: winner,
					difference: diff,
					prompt,
				});
				setRunResults([...results]);

				runNumber++;

				if (p < prompts.length - 1 || i < numRuns - 1) {
					await new Promise((resolve) => setTimeout(resolve, 500));
				}
			}
		}

		stopTimer();
		setCurrentRun(totalRunsCount);
	}, [gatewayUrl, gatewayApiKey, openaiApiKey, prompts, numRuns, startTimer, stopTimer, t]);

	const handleStop = useCallback(() => {
		setGatewayState("idle");
		setOpenaiState("idle");
		stopTimer();
	}, [stopTimer]);

	const downloadCSV = () => {
		const csv = exportToCSV(runResults);
		const blob = new Blob([csv], { type: "text/csv" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `latency-comparison-${Date.now()}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const downloadJSON = () => {
		const json = exportToJSON(runResults);
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `latency-comparison-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const gatewayTimes = runResults
		.filter((r) => !r.gateway.error)
		.map((r) => r.gateway.totalTime);
	const openaiTimes = runResults
		.filter((r) => !r.openai.error)
		.map((r) => r.openai.totalTime);

	const gatewayTTFTs = runResults
		.filter((r) => r.gateway.ttft !== null)
		.map((r) => r.gateway.ttft!);
	const openaiTTFTs = runResults
		.filter((r) => r.openai.ttft !== null)
		.map((r) => r.openai.ttft!);

	const gatewayThroughputs = runResults
		.filter((r) => r.gateway.throughput !== null)
		.map((r) => r.gateway.throughput!);
	const openaiThroughputs = runResults
		.filter((r) => r.openai.throughput !== null)
		.map((r) => r.openai.throughput!);

	const gatewayStats = calculateStats(gatewayTimes);
	const openphaseo = calculateStats(openaiTimes);
	const gatewayTTFTStats = calculateStats(gatewayTTFTs);
	const openaiTTFTStats = calculateStats(openaiTTFTs);
	const gatewayThroughputStats = calculateStats(gatewayThroughputs);
	const openaiThroughputStats = calculateStats(openaiThroughputs);

	const diffStats = calculateDifferenceStats(runResults);

	const successfulRuns = runResults.filter(
		(r) => !r.gateway.error && !r.openai.error
	);
	const gatewayWins = successfulRuns.filter((r) => r.gatewayWinner === "gateway").length;
	const openaiWins = successfulRuns.filter((r) => r.gatewayWinner === "openai").length;
	const ties = successfulRuns.filter((r) => r.gatewayWinner === null).length;

	const overallWinner =
		successfulRuns.length > 0
			? gatewayWins > openaiWins
				? "gateway"
				: openaiWins > gatewayWins
					? "openai"
					: null
			: null;

	const latestResult = runResults[runResults.length - 1];

	return (
		<div className="container mx-auto py-8 max-w-6xl">
			<div className="flex flex-col gap-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
						<p className="text-muted-foreground">
							{t("description")}
						</p>
					</div>
					<div className="flex gap-2">
						{runResults.length > 0 && (
							<>
								<Button variant="outline" size="sm" onClick={downloadCSV} className="flex items-center gap-2">
									<Download className="h-4 w-4" />
									CSV
								</Button>
								<Button variant="outline" size="sm" onClick={downloadJSON} className="flex items-center gap-2">
									<Download className="h-4 w-4" />
									JSON
								</Button>
							</>
						)}
						<Button variant="outline" size="sm" onClick={() => setShowSaveDialog(true)} className="flex items-center gap-2">
							<Save className="h-4 w-4" />
							{t("saveConfig")}
						</Button>
					</div>
				</div>

				{showSaveDialog && (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center justify-between">
								{t("saveConfiguration")}
				<Button
					variant="ghost"
					size="icon"
					aria-label={t("closeSaveDialog")}
					onClick={() => setShowSaveDialog(false)}
				>
									<X className="h-4 w-4" />
								</Button>
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label>{t("configName")}</Label>
								<Input
									value={configName}
									onChange={(e) => setConfigName(e.target.value)}
									placeholder={t("configPlaceholder")}
								/>
							</div>
							<Button onClick={saveConfig} disabled={!configName.trim()}>{extrasT("save")}</Button>
						</CardContent>
					</Card>
				)}

				{savedConfigs.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle className="text-sm">{t("savedConfigurations")}</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex flex-wrap gap-2">
								{savedConfigs.map((config) => (
									<div key={config.id} className="flex items-center gap-1 bg-muted rounded-md px-3 py-1">
										<Button variant="ghost" size="sm" onClick={() => loadConfig(config)}>
											{config.name}
										</Button>
						<Button
							variant="ghost"
							size="icon"
							className="h-4 w-4"
							aria-label={t("deleteSavedConfig")}
							onClick={() => deleteConfig(config.id)}
						>
											<X className="h-3 w-3" />
										</Button>
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				)}

				<Alert>
					<Zap className="h-4 w-4" />
					<AlertDescription>
						{t("parallelRequestsDescription")}
					</AlertDescription>
				</Alert>

				<Card>
					<CardHeader>
						<CardTitle>{t("configuration")}</CardTitle>
						<CardDescription>
							{t("credentialsDescription")}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-6">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div className="space-y-4">
									<div className="space-y-2">
										<Label htmlFor="gatewayUrl">{t("gatewayUrl")}</Label>
										<Input
											id="gatewayUrl"
											placeholder="https://your-gateway.com"
											value={gatewayUrl}
											onChange={(e) => setGatewayUrl(e.target.value)}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="gatewayKey">{t("gatewayApiKey")}</Label>
										<Input
											id="gatewayKey"
											type="password"
											placeholder="sk-..."
											value={gatewayApiKey}
											onChange={(e) => setGatewayApiKey(e.target.value)}
										/>
									</div>
									<div className="space-y-2">
										<Label>{extrasT("model")}</Label>
										<Input value={gatewayModel} disabled className="bg-muted" />
									</div>
								</div>
								<div className="space-y-4">
									<div className="space-y-2">
										<Label htmlFor="openaiUrl">{t("openaiUrl")}</Label>
										<Input
											id="openaiUrl"
											value="https://api.openai.com/v1"
											disabled
											className="bg-muted"
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="openaiKey">{t("openaiApiKey")}</Label>
										<Input
											id="openaiKey"
											type="password"
											placeholder="sk-..."
											value={openaiApiKey}
											onChange={(e) => setOpenaiApiKey(e.target.value)}
										/>
									</div>
									<div className="space-y-2">
										<Label>{extrasT("model")}</Label>
										<Input value={openaiModel} disabled className="bg-muted" />
									</div>
								</div>
							</div>

							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label>{t("prompts")}</Label>
									<Button variant="outline" size="sm" onClick={addPrompt} className="flex items-center gap-1">
										<Plus className="h-3 w-3" />
										{t("addPrompt")}
									</Button>
								</div>
								<div className="space-y-2">
									{prompts.map((prompt, index) => (
										<div key={index} className="flex items-center gap-2">
											<Input
												value={prompt}
												onChange={(e) => updatePrompt(index, e.target.value)}
												placeholder={t("promptPlaceholder", { number: index + 1 })}
											/>
											{prompts.length > 1 && (
								<Button
									variant="ghost"
									size="icon"
									aria-label={t("removePrompt")}
									onClick={() => removePrompt(index)}
								>
													<X className="h-4 w-4" />
												</Button>
											)}
										</div>
									))}
								</div>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div className="space-y-2">
									<Label htmlFor="numRuns">{t("runsPerPrompt")}</Label>
									<div className="flex items-center gap-2">
										<Input
											id="numRuns"
											type="number"
											min={1}
											max={10}
											value={numRuns}
											onChange={(e) => setNumRuns(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
											className="w-24"
										/>
										<span className="text-sm text-muted-foreground">
										{t("promptRunSummary", {
											promptCount: prompts.length,
											runCount: prompts.length * numRuns,
										})}
										</span>
									</div>
								</div>
							</div>

							<div className="flex gap-4">
								<Button
									onClick={handleRun}
									disabled={isRunning}
									className="flex items-center gap-2"
								>
									{isRunning ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<Play className="h-4 w-4" />
									)}
									{isRunning
										? t("runningCount", { currentRun, totalRuns })
										: t("runComparison")}
								</Button>
								<Button
									variant="outline"
									onClick={handleStop}
									disabled={!isRunning}
									className="flex items-center gap-2"
								>
									<Square className="h-4 w-4" />
									{t("stop")}
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>

				{isRunning && (
					<Card>
						<CardContent className="py-6">
							<div className="flex items-center justify-center gap-4">
								<div className="text-center">
									<div className="text-4xl font-mono font-bold text-primary">
										{formatLocalizedTime(elapsedTime)}
									</div>
									<div className="text-sm text-muted-foreground">
										{t("elapsedRun", { currentRun, totalRuns })}
									</div>
								</div>
							</div>
							<div className="mt-4 flex justify-center gap-8">
								<div className="flex items-center gap-2">
									<div className={`w-3 h-3 rounded-full ${gatewayState === "running" ? "bg-primary animate-pulse" : gatewayState === "completed" ? "bg-green-500" : gatewayState === "error" ? "bg-red-500" : "bg-muted"}`} />
									<span className="text-sm">Gateway</span>
								</div>
								<div className="flex items-center gap-2">
									<div className={`w-3 h-3 rounded-full ${openaiState === "running" ? "bg-primary animate-pulse" : openaiState === "completed" ? "bg-green-500" : openaiState === "error" ? "bg-red-500" : "bg-muted"}`} />
									<span className="text-sm">OpenAI</span>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{runResults.length > 0 && (
					<Card>
						<CardHeader>
							<div className="flex items-center justify-between">
								<CardTitle className="flex items-center gap-2">
									<BarChart3 className="h-5 w-5" />
										{t("aggregatedResults", { completedRuns: runResults.length, totalRuns })}
								</CardTitle>
								<div className="flex gap-2">
									{runResults.length === totalRuns && totalRuns > 1 && (
										<Button variant="ghost" size="sm" onClick={() => setShowAllRuns(!showAllRuns)}>
											{showAllRuns ? t("hideAllRuns") : t("showAllRuns")}
										</Button>
									)}
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<div className="mb-6">
								<h4 className="font-medium mb-2 text-sm text-muted-foreground">{t("responseTimes")}</h4>
								<TimelineChart gatewayTimes={gatewayTimes} openaiTimes={openaiTimes} />
								<div className="flex justify-center gap-4 mt-2 text-xs">
									<div className="flex items-center gap-1">
										<div className="w-3 h-3 rounded-full bg-green-500" />
										<span>Gateway</span>
									</div>
									<div className="flex items-center gap-1">
										<div className="w-3 h-3 rounded-full bg-blue-500" />
										<span>OpenAI</span>
									</div>
								</div>
							</div>

							<Tabs defaultValue="times" className="w-full">
								<TabsList className="grid w-full grid-cols-4">
									<TabsTrigger value="times">{t("totalTimes")}</TabsTrigger>
									<TabsTrigger value="ttft">TTFT</TabsTrigger>
									<TabsTrigger value="throughput">{extrasT("throughput")}</TabsTrigger>
									<TabsTrigger value="differences">{t("differences")}</TabsTrigger>
								</TabsList>

								<TabsContent value="times" className="mt-4">
									<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
										<div>
											<h3 className="font-medium mb-3 flex items-center gap-2">
												<Server className="h-4 w-4" />
												{t("yourGateway")}
											</h3>
											<div className="space-y-2 text-sm">
												<div className="flex justify-between">
									<span className="text-muted-foreground">{t("average")}</span>
													<span className="font-mono">{formatLocalizedTime(gatewayStats.avg)}</span>
												</div>
												<div className="flex justify-between">
									<span className="text-muted-foreground">{t("median")}</span>
													<span className="font-mono">{formatLocalizedTime(gatewayStats.median)}</span>
												</div>
												<div className="flex justify-between">
									<span className="text-muted-foreground">{t("stdDev")}</span>
													<span className="font-mono">{formatLocalizedTime(gatewayStats.stdDev)}</span>
												</div>
												<div className="flex justify-between">
									<span className="text-muted-foreground">{t("minBest")}</span>
													<span className="font-mono text-green-500">{formatLocalizedTime(gatewayStats.min)}</span>
												</div>
												<div className="flex justify-between">
									<span className="text-muted-foreground">{t("maxWorst")}</span>
													<span className="font-mono text-red-500">{formatLocalizedTime(gatewayStats.max)}</span>
												</div>
											</div>
										</div>
										<div>
											<h3 className="font-medium mb-3 flex items-center gap-2">
												<Logo id="openai" className="h-4 w-4" width={16} height={16} />
												OpenAI API
											</h3>
											<div className="space-y-2 text-sm">
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("average")}</span>
													<span className="font-mono">{formatLocalizedTime(openphaseo.avg)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("median")}</span>
													<span className="font-mono">{formatLocalizedTime(openphaseo.median)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("stdDev")}</span>
													<span className="font-mono">{formatLocalizedTime(openphaseo.stdDev)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("minBest")}</span>
													<span className="font-mono text-green-500">{formatLocalizedTime(openphaseo.min)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("maxWorst")}</span>
													<span className="font-mono text-red-500">{formatLocalizedTime(openphaseo.max)}</span>
												</div>
											</div>
										</div>
									</div>
								</TabsContent>

								<TabsContent value="ttft" className="mt-4">
									<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
										<div>
											<h3 className="font-medium mb-3 flex items-center gap-2">
												<Server className="h-4 w-4" />
												{t("yourGatewayTtft")}
											</h3>
											<div className="space-y-2 text-sm">
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("averageTtft")}</span>
													<span className="font-mono">{formatLocalizedTime(gatewayTTFTStats.avg)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("medianTtft")}</span>
													<span className="font-mono">{formatLocalizedTime(gatewayTTFTStats.median)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("stdDev")}</span>
													<span className="font-mono">{formatLocalizedTime(gatewayTTFTStats.stdDev)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("minTtft")}</span>
													<span className="font-mono text-green-500">{formatLocalizedTime(gatewayTTFTStats.min)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("maxTtft")}</span>
													<span className="font-mono text-red-500">{formatLocalizedTime(gatewayTTFTStats.max)}</span>
												</div>
											</div>
										</div>
										<div>
											<h3 className="font-medium mb-3 flex items-center gap-2">
												<Logo id="openai" className="h-4 w-4" width={16} height={16} />
												OpenAI API (TTFT)
											</h3>
											<div className="space-y-2 text-sm">
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("averageTtft")}</span>
													<span className="font-mono">{formatLocalizedTime(openaiTTFTStats.avg)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("medianTtft")}</span>
													<span className="font-mono">{formatLocalizedTime(openaiTTFTStats.median)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("stdDev")}</span>
													<span className="font-mono">{formatLocalizedTime(openaiTTFTStats.stdDev)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("minTtft")}</span>
													<span className="font-mono text-green-500">{formatLocalizedTime(openaiTTFTStats.min)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("maxTtft")}</span>
													<span className="font-mono text-red-500">{formatLocalizedTime(openaiTTFTStats.max)}</span>
												</div>
											</div>
										</div>
									</div>
								</TabsContent>

								<TabsContent value="throughput" className="mt-4">
									<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
										<div>
											<h3 className="font-medium mb-3 flex items-center gap-2">
												<Server className="h-4 w-4" />
												{t("yourGatewayThroughput")}
											</h3>
											<div className="space-y-2 text-sm">
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("avgThroughput")}</span>
													<span className="font-mono">{formatNumber(gatewayThroughputStats.avg)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("medianThroughput")}</span>
													<span className="font-mono">{formatNumber(gatewayThroughputStats.median)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("stdDev")}</span>
													<span className="font-mono">{formatNumber(gatewayThroughputStats.stdDev)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("maxThroughput")}</span>
													<span className="font-mono text-green-500">{formatNumber(gatewayThroughputStats.max)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("minThroughput")}</span>
													<span className="font-mono text-red-500">{formatNumber(gatewayThroughputStats.min)}</span>
												</div>
											</div>
										</div>
										<div>
											<h3 className="font-medium mb-3 flex items-center gap-2">
												<Logo id="openai" className="h-4 w-4" width={16} height={16} />
												OpenAI API (tokens/sec)
											</h3>
											<div className="space-y-2 text-sm">
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("avgThroughput")}</span>
													<span className="font-mono">{formatNumber(openaiThroughputStats.avg)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("medianThroughput")}</span>
													<span className="font-mono">{formatNumber(openaiThroughputStats.median)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("stdDev")}</span>
													<span className="font-mono">{formatNumber(openaiThroughputStats.stdDev)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("maxThroughput")}</span>
													<span className="font-mono text-green-500">{formatNumber(openaiThroughputStats.max)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("minThroughput")}</span>
													<span className="font-mono text-red-500">{formatNumber(openaiThroughputStats.min)}</span>
												</div>
											</div>
										</div>
									</div>
								</TabsContent>

								<TabsContent value="differences" className="mt-4">
									<div className="space-y-6">
										<div>
											<h4 className="font-medium mb-3">{t("differenceGatewayOpenai")}</h4>
											<div className="grid grid-cols-2 gap-4 text-sm">
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("avgDifference")}</span>
													<span className="font-mono">{formatLocalizedTime(diffStats.avgDiff)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-muted-foreground">{t("medianDifference")}</span>
													<span className="font-mono">{formatLocalizedTime(diffStats.medianDiff)}</span>
												</div>
											</div>
										</div>

										<div className="pt-4 border-t">
											<div className="flex justify-center gap-6 text-sm">
												<div className="flex items-center gap-2">
													<TrendingUp className="h-4 w-4 text-green-500" />
													<span>{t("gatewayWins")}: <strong>{gatewayWins}</strong> ({gatewayWins > 0 ? formatNumber((gatewayWins / successfulRuns.length) * 100) : 0}%)</span>
												</div>
												<div className="flex items-center gap-2">
													<TrendingUp className="h-4 w-4 text-blue-500" />
													<span>{t("openaiWins")}: <strong>{openaiWins}</strong> ({openaiWins > 0 ? formatNumber((openaiWins / successfulRuns.length) * 100) : 0}%)</span>
												</div>
												{ties > 0 && (
													<div className="flex items-center gap-2">
														<span>{t("ties")}: <strong>{ties}</strong></span>
													</div>
												)}
											</div>
											{overallWinner && (
												<div className="mt-4 text-center">
													<Badge
														variant={overallWinner === "gateway" ? "default" : "secondary"}
														className="text-sm"
													>
														{overallWinner === "gateway" ? "✓" : "△"}{" "}
														{overallWinner === "gateway"
															? t("gatewayWinsOverall")
															: t("openaiWinsOverall")}
													</Badge>
												</div>
											)}
										</div>
									</div>
								</TabsContent>
							</Tabs>
						</CardContent>
					</Card>
				)}

				{showAllRuns && runResults.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle>{t("allRuns")}</CardTitle>
							<CardDescription>{t("detailedResults")}</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-3">
								{runResults.map((result) => (
									<div key={result.runNumber} className="p-4 border rounded-lg space-y-2">
										<div className="flex items-center justify-between">
											<span className="font-medium">{t("runNumber", { number: result.runNumber })}</span>
											<Badge
												variant={result.gatewayWinner === "gateway" ? "default" : result.gatewayWinner === "openai" ? "secondary" : "outline"}
											>
												{result.gatewayWinner === "gateway" ? "✓ Gateway" : result.gatewayWinner === "openai" ? "✓ OpenAI" : t("tie")}
											</Badge>
										</div>
										<p className="text-sm text-muted-foreground truncate">{result.prompt}</p>
										<div className="grid grid-cols-2 gap-4 text-sm">
											<div>
												<div className="font-medium flex items-center gap-1">
													<Server className="h-3 w-3" />
													Gateway
												</div>
												{result.gateway.error ? (
													<span className="text-red-500 text-xs">{result.gateway.error}</span>
												) : (
													<div className="space-y-1 text-xs">
														<div>TTFT: {formatLocalizedTime(result.gateway.ttft)}</div>
														<div>{t("totalTime")}: {formatLocalizedTime(result.gateway.totalTime)}</div>
														<div>{t("chunks")}: {result.gateway.chunks}</div>
														<div>{extrasT("throughput")}: {result.gateway.throughput ? formatNumber(result.gateway.throughput) + "/s" : t("nA")}</div>
													</div>
												)}
											</div>
											<div>
												<div className="font-medium flex items-center gap-1">
													<Logo id="openai" className="h-3 w-3" width={12} height={12} />
													OpenAI
												</div>
												{result.openai.error ? (
													<span className="text-red-500 text-xs">{result.openai.error}</span>
												) : (
													<div className="space-y-1 text-xs">
														<div>TTFT: {formatLocalizedTime(result.openai.ttft)}</div>
														<div>{t("totalTime")}: {formatLocalizedTime(result.openai.totalTime)}</div>
														<div>{t("chunks")}: {result.openai.chunks}</div>
														<div>{extrasT("throughput")}: {result.openai.throughput ? formatNumber(result.openai.throughput) + "/s" : t("nA")}</div>
													</div>
												)}
											</div>
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				)}

				{runResults.length > 0 && !isRunning && runResults.length === totalRuns && (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Server className="h-5 w-5" />
									{t("latestProvider", { provider: "Gateway" })}
								</CardTitle>
							</CardHeader>
							<CardContent>
								{latestResult && (
									<>
										{latestResult.gateway.error ? (
											<div className="p-3 bg-red-500/10 border border-red-500 rounded text-sm text-red-500">
												<strong>{t("error")}:</strong> {latestResult.gateway.error}
											</div>
										) : (
											<div className="space-y-2 mb-4">
												<div className="flex justify-between text-sm">
													<span className="text-muted-foreground">TTFT</span>
													<span className="font-mono">{formatLocalizedTime(latestResult.gateway.ttft)}</span>
												</div>
												<div className="flex justify-between text-sm">
													<span className="text-muted-foreground">{t("totalTime")}</span>
													<span className="font-mono">{formatLocalizedTime(latestResult.gateway.totalTime)}</span>
												</div>
												<div className="flex justify-between text-sm">
													<span className="text-muted-foreground">{t("chunks")}</span>
													<span className="font-mono">{latestResult.gateway.chunks}</span>
												</div>
												<div className="flex justify-between text-sm">
													<span className="text-muted-foreground">{extrasT("throughput")}</span>
													<span className="font-mono">{latestResult.gateway.throughput ? formatNumber(latestResult.gateway.throughput) + "/s" : t("nA")}</span>
												</div>
											</div>
										)}
										<div className="bg-muted rounded p-3 text-sm min-h-[100px] max-h-[200px] overflow-y-auto">
											{gatewayContent || (
													<span className="text-muted-foreground">{extrasT("responsePlaceholder")}</span>
											)}
										</div>
									</>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Logo id="openai" className="h-5 w-5" width={20} height={20} />
									{t("latestProvider", { provider: "OpenAI API" })}
								</CardTitle>
							</CardHeader>
							<CardContent>
								{latestResult && (
									<>
										{latestResult.openai.error ? (
											<div className="p-3 bg-red-500/10 border border-red-500 rounded text-sm text-red-500">
												<strong>{t("error")}:</strong> {latestResult.openai.error}
											</div>
										) : (
											<div className="space-y-2 mb-4">
												<div className="flex justify-between text-sm">
													<span className="text-muted-foreground">TTFT</span>
													<span className="font-mono">{formatLocalizedTime(latestResult.openai.ttft)}</span>
												</div>
												<div className="flex justify-between text-sm">
													<span className="text-muted-foreground">{t("totalTime")}</span>
													<span className="font-mono">{formatLocalizedTime(latestResult.openai.totalTime)}</span>
												</div>
												<div className="flex justify-between text-sm">
													<span className="text-muted-foreground">{t("chunks")}</span>
													<span className="font-mono">{latestResult.openai.chunks}</span>
												</div>
												<div className="flex justify-between text-sm">
													<span className="text-muted-foreground">{extrasT("throughput")}</span>
													<span className="font-mono">{latestResult.openai.throughput ? formatNumber(latestResult.openai.throughput) + "/s" : t("nA")}</span>
												</div>
											</div>
										)}
										<div className="bg-muted rounded p-3 text-sm min-h-[100px] max-h-[200px] overflow-y-auto">
											{openaiContent || (
													<span className="text-muted-foreground">{extrasT("responsePlaceholder")}</span>
											)}
										</div>
									</>
								)}
							</CardContent>
						</Card>
					</div>
				)}
			</div>
		</div>
	);
}
