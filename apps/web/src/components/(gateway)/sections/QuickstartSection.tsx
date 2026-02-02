"use client";

import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ChevronDown, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CodeBlock from "@/components/(data)/model/quickstart/CodeBlock";
import type { GatewayMarketingMetrics } from "@/lib/fetchers/gateway/getMarketingMetrics";
import { BASE_URL } from "@/components/(data)/model/quickstart/config";
import type { ShikiLang } from "@/components/(data)/model/quickstart/shiki";

const LANGUAGE_OPTIONS = [
	"curl",
	"typescript",
	"python",
	"typescript-sdk",
	"python-sdk",
	"typescript-openai",
	"python-openai",
] as const;
type Language = (typeof LANGUAGE_OPTIONS)[number];

const LANGUAGE_LABELS: Record<Language, string> = {
	curl: "cURL",
	typescript: "TypeScript (fetch)",
	python: "Python (requests)",
	"typescript-sdk": "TypeScript SDK",
	"python-sdk": "Python SDK",
	"typescript-openai": "TypeScript (OpenAI)",
	"python-openai": "Python (OpenAI)",
};

const LANGUAGE_BADGES: Partial<Record<Language, string>> = {
	"typescript-openai": "Beta",
	"python-openai": "Beta",
};

const LANGUAGE_TO_SHIKI: Record<Language, ShikiLang> = {
	curl: "bash",
	typescript: "ts",
	python: "python",
	"typescript-sdk": "ts",
	"python-sdk": "python",
	"typescript-openai": "ts",
	"python-openai": "python",
};

const SDK_METHODS: Record<EndpointId, { js: string; py: string }> = {
	completions: { js: "chatCompletions", py: "chat_completions" },
	images: { js: "generateImages", py: "generate_images" },
	video: { js: "generateVideo", py: "generate_video" },
	audio: { js: "generateAudio", py: "generate_audio" },
	embeddings: { js: "embeddings", py: "embeddings" },
	moderations: { js: "moderations", py: "moderations" },
};

type EndpointId =
	| "completions"
	| "images"
	| "video"
	| "audio"
	| "embeddings"
	| "moderations";

type EndpointConfig = {
	id: EndpointId;
	label: string;
	summary: string;
	highlight: string;
	path: string;
	body: (model: string) => Record<string, unknown>;
};

const ENDPOINT_CONFIGS: EndpointConfig[] = [
	{
		id: "completions",
		label: "Completions",
		summary:
			"Chat, reasoning, and tool-calling with instant provider failover.",
		highlight: "Streaming + structured output supported out of the box.",
		path: "/chat/completions",
		body: (model) => ({
			model,
			messages: [
				{
					role: "system",
					content:
						"You are an AI operations assistant helping summarise live gateway telemetry.",
				},
				{
					role: "user",
					content:
						"Summarise the last 24 hours of latency and throughput for our release notes.",
				},
			],
		}),
	},
	{
		id: "images",
		label: "Image Gen",
		summary:
			"Generate high-fidelity imagery with routing that understands provider quirks.",
		highlight: "Unified prompt schema with automatic upscaling options.",
		path: "/images/generations",
		body: (model) => ({
			model,
			prompt: "Create a cinematic hero image of an AI observability dashboard lit by soft ambient light.",
			size: "1024x1024",
			quality: "high",
		}),
	},
	{
		id: "video",
		label: "Video Gen",
		summary:
			"Launch product teasers or walkthroughs without juggling bespoke video APIs.",
		highlight: "Duration, format, and seed controls stay consistent.",
		path: "/video/generation",
		body: (model) => ({
			model,
			prompt: "An engineer exploring a real-time operations room, charts updating smoothly, confident tone.",
			duration_seconds: 6,
			aspect_ratio: "16:9",
		}),
	},
	{
		id: "audio",
		label: "Audio Gen",
		summary:
			"Programmatic voice generation with unified input and format parameters.",
		highlight: "BYOK compatible for provider-specific voices.",
		path: "/audio/speech",
		body: (model) => ({
			model,
			voice: "alloy",
			input: "Welcome to the AI Stats Gateway where latency, uptime, and pricing are always in your control.",
			format: "mp3",
		}),
	},
	{
		id: "embeddings",
		label: "Embeddings",
		summary:
			"Vector representations from any provider with consistent batching semantics.",
		highlight: "Deterministic fallbacks keep retrieval pipelines steady.",
		path: "/embeddings",
		body: (model) => ({
			model,
			input: [
				"Route requests across providers with AI Stats.",
				"Monitor latency, throughput, and spend in real time.",
			],
		}),
	},
	{
		id: "moderations",
		label: "Moderations",
		summary:
			"Run safety checks without reshaping payloads for each moderation API.",
		highlight: "Granular category scores and community-reviewed defaults.",
		path: "/moderations",
		body: (model) => ({
			model,
			input: "Review this prompt for policy compliance before it reaches the downstream model.",
		}),
	},
];

const FALLBACK_MODELS: Record<EndpointId, string[]> = {
	completions: [
		"openai/gpt-4.1-mini",
		"anthropic/claude-3.5-sonnet",
		"google-ai-studio/gemini-2.5-flash",
	],
	images: [
		"openai/gpt-image-1",
		"stability/stable-diffusion-3.5",
		"google-ai-studio/image-3.0",
	],
	video: ["openai/sora-1", "runway/gen-3", "luma/dream-machine"],
	audio: [
		"openai/gpt-4o-mini-voice",
		"elevenlabs/voice-v3",
		"google-ai-studio/audiofx-1",
	],
	embeddings: [
		"openai/text-embedding-3-large",
		"cohere/embed-multilingual-v3.0",
		"nomic-ai/nomic-embed-text",
	],
	moderations: [
		"openai/omni-moderation-latest",
		"meta/llama-guard-3",
		"google-ai-studio/safescreen-1",
	],
};

const PROMOTED_MODELS: Record<EndpointId, string[]> = {
	completions: [
		"openai/gpt-4.1-mini",
		"anthropic/claude-3.5-sonnet",
		"mistral/miro-1",
	],
	images: [
		"openai/gpt-image-1",
		"stability/stable-diffusion-3.5",
		"runway/gen-2",
	],
	video: ["openai/sora-1", "runway/gen-3"],
	audio: ["openai/gpt-4o-mini-voice", "elevenlabs/voice-v3"],
	embeddings: [
		"openai/text-embedding-3-large",
		"cohere/embed-multilingual-v3.0",
	],
	moderations: ["openai/omni-moderation-latest"],
};

const OPENAI_CLIENT_METHODS: Record<EndpointId, string> = {
	completions: "chat.completions.create",
	images: "images.generate",
	video: "video.generate",
	audio: "audio.speech.create",
	embeddings: "embeddings.create",
	moderations: "moderations.create",
};

function formatPercent(value: number | null | undefined, digits = 2): string {
	const normalized = value == null || Number.isNaN(value) ? 0 : value;
	return `${normalized.toFixed(digits)}%`;
}

function formatLatency(value: number | null | undefined): string {
	const normalized = value == null || Number.isNaN(value) ? 0 : value;
	return `${Math.round(normalized)} ms`;
}

function formatCompactNumber(value: number | null | undefined): string {
	const normalized = value == null || Number.isNaN(value) ? 0 : value;
	return Intl.NumberFormat("en-US", {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(normalized);
}

function formatAbsoluteNumber(
	value: number | string | null | undefined
): string {
	if (value == null) return "0";
	const numericValue =
		typeof value === "number" ? value : Number.parseFloat(String(value));
	if (!Number.isFinite(numericValue)) return "0";
	return Intl.NumberFormat("en-US").format(Math.round(numericValue));
}

function formatHourLabel(iso: string): string {
	const date = new Date(iso);
	return date.toLocaleString(undefined, {
		weekday: "short",
		hour: "numeric",
	});
}

function formatHoursAgoTick(value: number | string | null | undefined): string {
	const hours =
		value == null || Number.isNaN(Number(value))
			? null
			: Math.max(0, Math.round(Number(value)));

	if (hours == null) {
		return "";
	}

	return hours === 0 ? "Now" : `${hours}h`;
}

function formatHoursAgoTooltip(
	value: number | string | null | undefined
): string {
	const hours =
		value == null || Number.isNaN(Number(value))
			? null
			: Math.max(0, Math.round(Number(value)));

	if (hours == null) {
		return "";
	}

	return hours === 0 ? "Now" : `${hours}h ago`;
}

function jsonToPythonLiteral(json: string): string {
	return json
		.replace(/true/g, "True")
		.replace(/false/g, "False")
		.replace(/null/g, "None");
}

function indentBlock(block: string, indent: string): string {
	return block
		.split("\n")
		.map((line) => `${indent}${line}`)
		.join("\n");
}

function formatTooltipNumber(
	value: number | string | null | undefined,
	unit: string
): string {
	if (value == null) return `0 ${unit}`;
	const numericValue =
		typeof value === "number" ? value : Number.parseFloat(String(value));
	if (!Number.isFinite(numericValue)) {
		return `0 ${unit}`;
	}
	return `${Intl.NumberFormat("en-US", {
		maximumFractionDigits: 1,
	}).format(numericValue)} ${unit}`;
}

function buildSnippets(
	config: EndpointConfig,
	model: string
): Record<Language, string> {
	const payload = config.body(model);
	const json = JSON.stringify(payload, null, 2);
	const escapedJson = json.replace(/'/g, "\\'");

	const tsJson = json
		.split("\n")
		.map((line) => `        ${line}`)
		.join("\n");

	const pythonJson = jsonToPythonLiteral(json)
		.split("\n")
		.map((line) => `    ${line}`)
		.join("\n");

	const tsLiteral = indentBlock(json, "    ");
	const pythonLiteral = indentBlock(pythonJson, "    ");
	const sdkMethods = SDK_METHODS[config.id];
	const jsMethod = sdkMethods?.js ?? config.id;
	const pyMethod = sdkMethods?.py ?? config.id;
	const openAiMethod =
		OPENAI_CLIENT_METHODS[config.id] ?? "chat.completions.create";

	return {
		curl: `curl -s -X POST "${BASE_URL}${config.path}" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_GATEWAY_KEY" \\
  -d '${escapedJson}'`,
		typescript: `const response = await fetch("${BASE_URL}${config.path}", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.AI_STATS_GATEWAY_KEY!,
    },
    body: JSON.stringify(
${tsJson}
    ),
});

if (!response.ok) {
    throw new Error(await response.text());
}

const data = await response.json();
console.log(data);`,
		python: `import requests

response = requests.post(
    "${BASE_URL}${config.path}",
    headers={
        "Content-Type": "application/json",
        "X-API-Key": "YOUR_GATEWAY_KEY",
    },
    json=${pythonJson}
)

response.raise_for_status()
print(response.json())`,
		"typescript-sdk": `import { AIStats } from "@ai-stats/ts-sdk";

const client = new AIStats({
    apiKey: process.env.AI_STATS_API_KEY ?? "YOUR_GATEWAY_KEY",
});

const response = await client.${jsMethod}(
${tsLiteral}
);

console.log(response);`,
		"python-sdk": `from ai_stats import AIStats

async def main():
    async with AIStats(api_key="YOUR_GATEWAY_KEY") as client:
        response = await client.${pyMethod}(
${pythonLiteral}
        )
        print(response)

import asyncio
asyncio.run(main())`,
		"typescript-openai": `// Beta: OpenAI client
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? "YOUR_OPENAI_KEY",
});

const response = await client.${openAiMethod}(
${tsJson}
);

console.log(response);`,
		"python-openai": `# Beta: OpenAI client
from openai import OpenAI
import os

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

response = client.${openAiMethod}(
${pythonJson}
)

print(response)`,
	};
}

function buildModelOptions(modelIds: string[]): Record<EndpointId, string[]> {
	const lowerIds = modelIds.map((id) => id.toLowerCase());
	const pick = (patterns: RegExp[], fallback: string[]): string[] => {
		const matches = modelIds.filter((model, idx) =>
			patterns.some((regex) => regex.test(lowerIds[idx]))
		);
		const unique = Array.from(new Set(matches));
		const result = unique.slice(0, 4);
		for (const candidate of fallback) {
			if (result.length >= 4) break;
			if (!result.includes(candidate)) result.push(candidate);
		}
		return result.slice(0, 4);
	};

	return {
		completions: pick(
			[/gpt/, /claude/, /mixtral/, /command/, /grok/, /sonnet/, /llama/],
			FALLBACK_MODELS.completions
		),
		images: pick(
			[/image/, /vision/, /diffusion/, /dream/, /imagine/, /sd[.\d]/],
			FALLBACK_MODELS.images
		),
		video: pick(
			[/video/, /sora/, /runway/, /gen/, /luma/, /dream/],
			FALLBACK_MODELS.video
		),
		audio: pick(
			[/audio/, /voice/, /speech/, /whisper/, /tts/],
			FALLBACK_MODELS.audio
		),
		embeddings: pick([/embed/, /embedding/], FALLBACK_MODELS.embeddings),
		moderations: pick(
			[/moderation/, /guard/, /safety/],
			FALLBACK_MODELS.moderations
		),
	};
}

interface QuickstartSectionProps {
	metrics: GatewayMarketingMetrics;
}

export function QuickstartSection({ metrics }: QuickstartSectionProps) {
	const [selectedEndpoint, setSelectedEndpoint] =
		useState<EndpointId>("completions");
	const [selectedLanguage, setSelectedLanguage] = useState<Language>("curl");
	const [copied, setCopied] = useState(false);
	const copyTimeoutRef = useRef<number | null>(null);

	const modelOptionsByEndpoint = useMemo(
		() => buildModelOptions(metrics.supported.modelIds ?? []),
		[metrics.supported.modelIds]
	);

	const [selectedModels, setSelectedModels] = useState<
		Record<EndpointId, string>
	>(() => {
		const initial: Record<EndpointId, string> = {
			completions: modelOptionsByEndpoint.completions[0],
			images: modelOptionsByEndpoint.images[0],
			video: modelOptionsByEndpoint.video[0],
			audio: modelOptionsByEndpoint.audio[0],
			embeddings: modelOptionsByEndpoint.embeddings[0],
			moderations: modelOptionsByEndpoint.moderations[0],
		};
		return initial;
	});

	useEffect(() => {
		setSelectedModels((prev) => {
			const next = { ...prev };
			for (const config of ENDPOINT_CONFIGS) {
				const options = modelOptionsByEndpoint[config.id];
				if (!options.length) continue;
				if (!options.includes(next[config.id])) {
					next[config.id] = options[0];
				}
			}
			return next;
		});
	}, [modelOptionsByEndpoint]);

	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) {
				window.clearTimeout(copyTimeoutRef.current);
			}
		};
	}, []);

	const currentConfig =
		ENDPOINT_CONFIGS.find((config) => config.id === selectedEndpoint) ??
		ENDPOINT_CONFIGS[0];
	const currentModel =
		selectedModels[selectedEndpoint] ||
		modelOptionsByEndpoint[selectedEndpoint][0];
	const codeSnippets = useMemo(
		() => buildSnippets(currentConfig, currentModel),
		[currentConfig, currentModel]
	);

	const handleCopyCode = useCallback(() => {
		const snippet = codeSnippets[selectedLanguage];
		if (
			!snippet ||
			typeof navigator === "undefined" ||
			!navigator.clipboard
		) {
			return;
		}

		navigator.clipboard.writeText(snippet).then(() => {
			setCopied(true);
			if (copyTimeoutRef.current) {
				window.clearTimeout(copyTimeoutRef.current);
			}
			copyTimeoutRef.current = window.setTimeout(
				() => setCopied(false),
				1400
			);
		});
	}, [codeSnippets, selectedLanguage]);

	return (
		<section id="quickstart" className="py-16">
			<div className="mx-auto max-w-7xl space-y-8 px-6 lg:px-8">
				<div className="max-w-3xl space-y-3">
					<h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
						Every endpoint, one schema
					</h2>
					<p className="text-sm text-slate-600 dark:text-slate-400">
						Swap endpoints and models without touching your
						integration. Use the TypeScript SDK (`@ai-stats/ts-sdk`)
						or Python SDK (`ai-stats-py-sdk`), or call the Gateway
						directly from cURL/fetch.
					</p>
				</div>

				<Card className="border-slate-200">
					<CardHeader className="space-y-4">
						<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<div className="space-y-1">
								<CardTitle className="text-xl">
									{currentConfig.label}
								</CardTitle>
								<p className="text-sm text-slate-600 dark:text-slate-400">
									{currentConfig.summary}
								</p>
							</div>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="flex items-center gap-2"
									>
										{currentConfig.label}
										<ChevronDown className="h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									{ENDPOINT_CONFIGS.map((config) => (
										<DropdownMenuItem
											key={config.id}
											onSelect={() =>
												setSelectedEndpoint(config.id)
											}
										>
											<div className="flex flex-col">
												<span>{config.label}</span>
												<span className="text-xs text-slate-500 dark:text-slate-300">
													{config.summary}
												</span>
											</div>
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
						<div className="flex flex-wrap items-center gap-3">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="flex items-center gap-2"
									>
										<span>
											{LANGUAGE_LABELS[selectedLanguage]}
										</span>
										{LANGUAGE_BADGES[selectedLanguage] ? (
											<span className="rounded-full border px-2 py-0.5 text-[0.6rem] uppercase text-slate-500 dark:text-slate-300">
												{
													LANGUAGE_BADGES[
														selectedLanguage
													]
												}
											</span>
										) : null}
										<ChevronDown className="h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent>
									{LANGUAGE_OPTIONS.map((option) => (
										<DropdownMenuItem
											key={option}
											onSelect={() =>
												setSelectedLanguage(
													option as Language
												)
											}
										>
											<div className="flex items-center justify-between gap-2">
												<span>
													{LANGUAGE_LABELS[option]}
												</span>
												{LANGUAGE_BADGES[option] ? (
													<span className="rounded-full border px-2 py-0.5 text-[0.6rem] uppercase text-slate-500 dark:text-slate-300">
														{
															LANGUAGE_BADGES[
																option
															]
														}
													</span>
												) : null}
											</div>
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
							<Button
								variant="outline"
								size="sm"
								className="flex items-center gap-1"
								onClick={handleCopyCode}
							>
								<Copy className="h-4 w-4" />
								{copied ? "Copied" : "Copy code"}
							</Button>
							<p className="text-xs text-slate-500 dark:text-slate-300">
								OpenAI options (Beta) may change as adapters
								mature.
							</p>
							<p className="text-xs text-slate-500 dark:text-slate-300">
								Base URL: {BASE_URL}
								{currentConfig.path}
							</p>
						</div>
					</CardHeader>

					<CardContent>
						{(() => {
							const baseModels =
								modelOptionsByEndpoint[currentConfig.id] ??
								FALLBACK_MODELS[currentConfig.id] ??
								[];
							const promoted =
								PROMOTED_MODELS[currentConfig.id] ?? [];
							const availableModels = Array.from(
								new Set([...promoted, ...baseModels])
							);
							const activeModel =
								selectedModels[currentConfig.id] ??
								availableModels[0] ??
								baseModels[0] ??
								"openai/gpt-4.1-mini";

							return (
								<div className="space-y-3">
									<div className="space-y-2">
										<p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
											Model
										</p>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="outline"
													size="sm"
													className="flex items-center gap-2"
												>
													<span>{activeModel}</span>
													<ChevronDown className="h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent>
												{availableModels.map(
													(model) => (
														<DropdownMenuItem
															key={model}
															onSelect={() =>
																setSelectedModels(
																	(prev) => ({
																		...prev,
																		[currentConfig.id]:
																			model,
																	})
																)
															}
														>
															{model}
														</DropdownMenuItem>
													)
												)}
											</DropdownMenuContent>
										</DropdownMenu>
										<p className="text-xs text-slate-500 dark:text-slate-300">
											Every model uses the same base
											request payload—swap the `model`
											value.
										</p>
									</div>
									<CodeBlock
										label={
											LANGUAGE_LABELS[selectedLanguage]
										}
										code={codeSnippets[selectedLanguage]}
										lang={
											LANGUAGE_TO_SHIKI[selectedLanguage]
										}
									/>
								</div>
							);
						})()}
					</CardContent>
				</Card>
			</div>
		</section>
	);
}
