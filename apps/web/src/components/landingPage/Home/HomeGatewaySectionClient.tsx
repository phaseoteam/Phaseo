"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
	ArrowRight,
	Check,
	ChevronsUpDown,
	Code2,
	Copy,
	Layers3,
	ShieldCheck,
} from "lucide-react";
import {
	codeToTokensBoth,
	type CodeTokensWithThemesResult,
	type ShikiLang,
} from "@/components/(data)/model/quickstart/shiki";
import { resolveLogo } from "@/lib/logos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const BASE_URL = "https://api.phaseo.app/v1";
const DOCS_HREF = "https://docs.ai-stats.phaseo.app/v1/quickstart";

const FALLBACK_MODEL_OPTIONS = [
	{
		id: "openai/gpt-5-2-2025-12-11",
		label: "GPT-5.2",
		provider: "OpenAI",
		logoId: "openai",
		description: "Flagship reasoning and production chat workloads.",
	},
	{
		id: "anthropic/claude-opus-4-6-2026-02-05",
		label: "Claude Opus 4.6",
		provider: "Anthropic",
		logoId: "anthropic",
		description: "Long-form analysis, writing, and high-context work.",
	},
	{
		id: "google/gemini-3-pro-preview-2025-11-18",
		label: "Gemini 3 Pro",
		provider: "Google",
		logoId: "google",
		description: "Multimodal workflows with broad tool compatibility.",
	},
	{
		id: "deepseek/deepseek-r1-2025-05-28",
		label: "DeepSeek R1",
		provider: "DeepSeek",
		logoId: "deepseek",
		description: "High-efficiency reasoning for cost-sensitive tasks.",
	},
] as const;

const LANGUAGE_OPTIONS = [
	{ id: "typescript", label: "TypeScript", shiki: "ts" as ShikiLang },
	{ id: "python", label: "Python", shiki: "python" as ShikiLang },
	{ id: "curl", label: "cURL", shiki: "bash" as ShikiLang },
] as const;

export type HomeGatewayModelOption = {
	id: string;
	label: string;
	provider: string;
	logoId: string;
	description: string;
};

type LanguageOption = (typeof LANGUAGE_OPTIONS)[number];
type LanguageId = LanguageOption["id"];
type ModelOption = HomeGatewayModelOption;
type TokenLine = CodeTokensWithThemesResult[number];
type Token = TokenLine[number];

const PROOF_POINTS = [
	{
		title: "One API surface",
		body: "Use OpenAI-compatible requests to reach GPT, Claude, Gemini, DeepSeek, and the rest of the catalog.",
		icon: Layers3,
	},
	{
		title: "Model database included",
		body: "Compare models, releases, pricing, and provider coverage before you ship a change to production.",
		icon: Code2,
	},
	{
		title: "Reliable by default",
		body: "Routing, failover, telemetry, and policy controls live in the same gateway your apps already call.",
		icon: ShieldCheck,
	},
] as const;

function buildSnippet(language: LanguageId, model: ModelOption) {
	const prompt = "Summarize the production risks we should act on today.";

	switch (language) {
		case "python":
			return `import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["AI_STATS_API_KEY"],
    base_url="${BASE_URL}"
)

response = client.chat.completions.create(
    model="${model.id}",
    messages=[
        {"role": "system", "content": "You help operate reliable AI products."},
        {"role": "user", "content": "${prompt}"},
    ],
)

print(response.choices[0].message.content)`;
		case "curl":
			return `curl ${BASE_URL}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $AI_STATS_API_KEY" \\
  -d '{
    "model": "${model.id}",
    "messages": [
      {"role": "system", "content": "You help operate reliable AI products."},
      {"role": "user", "content": "${prompt}"}
    ]
  }'`;
		case "typescript":
		default:
			return `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AI_STATS_API_KEY!,
  baseURL: "${BASE_URL}",
});

const response = await client.chat.completions.create({
  model: "${model.id}",
  messages: [
    { role: "system", content: "You help operate reliable AI products." },
    { role: "user", content: "${prompt}" },
  ],
});

console.log(response.choices[0]?.message?.content);`;
	}
}

function getTokenStyle(token: Token): CSSProperties {
	const light = token.variants.light;
	const fontStyle = light.fontStyle ?? 0;
	const dark = token.variants.dark;
	const style: CSSProperties & Record<string, string | number> = {
		color: light.color ?? "currentColor",
		"--token-dark": dark.color ?? light.color ?? "currentColor",
	};

	if (fontStyle & 1) style.fontStyle = "italic";
	if (fontStyle & 2) style.fontWeight = 600;
	if (fontStyle & 4) style.textDecoration = "underline";

	return style;
}

function PlainCode({ code }: { code: string }) {
	return (
		<pre className="overflow-x-auto px-6 py-6 text-[13px] leading-6 text-zinc-900 dark:text-zinc-100 sm:px-7">
			<code>{code}</code>
		</pre>
	);
}

function ModelLogo({ model }: { model: ModelOption }) {
	const logo = resolveLogo(model.logoId, {
		variant: "color",
		theme: "light",
		fallbackToColor: true,
	});

	return (
		<span className="flex h-4 w-4 items-center justify-center rounded-full border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
			{logo.src ? (
				<img src={logo.src} alt={model.provider} className="h-3 w-3 object-contain" />
			) : (
				<span className="h-2 w-2 rounded-full bg-zinc-900 dark:bg-zinc-100" />
			)}
		</span>
	);
}

function ModelBadge({
	model,
	modelOptions,
	onSelectModel,
}: {
	model: ModelOption;
	modelOptions: readonly ModelOption[];
	onSelectModel: (modelId: string) => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					role="combobox"
					aria-expanded={open}
					className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-2.5 py-0.5 align-middle text-[12px] font-semibold leading-5 text-zinc-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-zinc-600"
				>
					<ModelLogo model={model} />
					<span>{model.id}</span>
					<ChevronsUpDown className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="bottom"
				sideOffset={10}
				className="w-[min(34rem,calc(100vw-2rem))] p-0"
			>
				<Command className="rounded-[24px]">
					<CommandInput placeholder="Search gateway models..." />
					<CommandList className="max-h-[26rem] p-1">
						<CommandEmpty>No models found.</CommandEmpty>
						{modelOptions.map((option) => (
							<CommandItem
								key={option.id}
								value={`${option.id} ${option.label} ${option.provider} ${option.description}`}
								onSelect={() => {
									onSelectModel(option.id);
									setOpen(false);
								}}
								className="flex items-start gap-3 rounded-[18px] px-3 py-3"
							>
								<span className="mt-0.5 shrink-0 rounded-2xl border border-zinc-200/80 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
									<ModelLogo model={option} />
								</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
										{option.id}
									</span>
									<span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
										{option.description}
									</span>
								</span>
								<Check
									className={cn(
										"mt-0.5 h-4 w-4 shrink-0",
										option.id === model.id ? "opacity-100" : "opacity-0"
									)}
								/>
							</CommandItem>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function TokenContent({
	token,
	model,
	modelOptions,
	onSelectModel,
}: {
	token: Token;
	model: ModelOption;
	modelOptions: readonly ModelOption[];
	onSelectModel: (modelId: string) => void;
}) {
	const style = getTokenStyle(token);
	const content = token.content;
	const modelIndex = content.indexOf(model.id);

	if (modelIndex === -1) {
		return (
			<span style={style} className="dark:[color:var(--token-dark)]">
				{content}
			</span>
		);
	}

	const before = content.slice(0, modelIndex);
	const after = content.slice(modelIndex + model.id.length);

	return (
		<>
			{before ? (
				<span style={style} className="dark:[color:var(--token-dark)]">
					{before}
				</span>
			) : null}
			<ModelBadge
				model={model}
				modelOptions={modelOptions}
				onSelectModel={onSelectModel}
			/>
			{after ? (
				<span style={style} className="dark:[color:var(--token-dark)]">
					{after}
				</span>
			) : null}
		</>
	);
}

function HighlightedSnippet({
	lines,
	model,
	modelOptions,
	onSelectModel,
}: {
	lines: CodeTokensWithThemesResult;
	model: ModelOption;
	modelOptions: readonly ModelOption[];
	onSelectModel: (modelId: string) => void;
}) {
	return (
		<pre className="overflow-x-auto px-6 py-6 text-[13px] leading-6 text-zinc-900 dark:text-zinc-100 sm:px-7">
			<code>
				{lines.map((line, lineIndex) => (
					<span key={lineIndex} className="block min-h-6">
						{line.length > 0 ? (
							line.map((token, tokenIndex) => (
								<span key={`${lineIndex}-${tokenIndex}`}>
									<TokenContent
										token={token}
										model={model}
										modelOptions={modelOptions}
										onSelectModel={onSelectModel}
									/>
								</span>
							))
						) : (
							<span>&nbsp;</span>
						)}
					</span>
				))}
			</code>
		</pre>
	);
}

function InlineModelCodeBlock({
	language,
	model,
	modelOptions,
	onSelectModel,
	onSelectLanguage,
}: {
	language: LanguageOption;
	model: ModelOption;
	modelOptions: readonly ModelOption[];
	onSelectModel: (modelId: string) => void;
	onSelectLanguage: (languageId: LanguageId) => void;
}) {
	const [copied, setCopied] = useState(false);
	const [tokens, setTokens] = useState<CodeTokensWithThemesResult | null>(null);
	const [error, setError] = useState(false);
	const snippet = useMemo(() => buildSnippet(language.id, model), [language.id, model]);

	useEffect(() => {
		let mounted = true;
		setTokens(null);
		async function highlight() {
			try {
				const rendered = await codeToTokensBoth(snippet, language.shiki);
				if (!mounted) return;
				setTokens(rendered);
				setError(false);
			} catch (err) {
				console.error("[HomeGatewaySection] highlight failed", err);
				if (mounted) setError(true);
			}
		}
		void highlight();
		return () => {
			mounted = false;
		};
	}, [language.shiki, snippet]);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(snippet);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1800);
	};

	return (
		<div className="overflow-hidden rounded-[32px] border border-zinc-200/80 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 px-4 py-4 dark:border-zinc-800 sm:px-5">
				<div className="flex flex-wrap items-center gap-2">
					{LANGUAGE_OPTIONS.map((option) => (
						<button
							key={option.id}
							type="button"
							onClick={() => onSelectLanguage(option.id)}
							className={cn(
								"rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
								language.id === option.id
									? "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950"
									: "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
							)}
						>
							{option.label}
						</button>
					))}
				</div>
				<button
					type="button"
					onClick={handleCopy}
					className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:text-zinc-100"
				>
					{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
					{copied ? "Copied" : "Copy"}
				</button>
			</div>
			{!error && tokens ? (
				<HighlightedSnippet
					lines={tokens}
					model={model}
					modelOptions={modelOptions}
					onSelectModel={onSelectModel}
				/>
			) : (
				<PlainCode code={snippet} />
			)}
		</div>
	);
}

export default function HomeGatewaySectionClient({
	modelOptions,
}: {
	modelOptions: readonly HomeGatewayModelOption[];
}) {
	const availableModels =
		modelOptions.length > 0 ? modelOptions : FALLBACK_MODEL_OPTIONS;
	const [languageId, setLanguageId] = useState<LanguageId>("typescript");
	const [activeModelId, setActiveModelId] = useState<string>(
		availableModels[0]?.id ?? FALLBACK_MODEL_OPTIONS[0].id
	);
	const language =
		LANGUAGE_OPTIONS.find((option) => option.id === languageId) ??
		LANGUAGE_OPTIONS[0];
	const activeModel =
		availableModels.find((entry) => entry.id === activeModelId) ??
		availableModels[0] ??
		FALLBACK_MODEL_OPTIONS[0];

	useEffect(() => {
		if (!availableModels.some((entry) => entry.id === activeModelId)) {
			setActiveModelId(availableModels[0]?.id ?? FALLBACK_MODEL_OPTIONS[0].id);
		}
	}, [activeModelId, availableModels]);

	return (
		<section className="w-full space-y-8">
			<div className="space-y-6">
				<Badge
					variant="secondary"
					className="border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
				>
					Gateway
				</Badge>
				<div className="space-y-4">
					<h2 className="text-3xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50 sm:text-5xl">
						One API for the models teams actually build with.
					</h2>
					<p className="max-w-4xl text-base leading-7 text-zinc-600 dark:text-zinc-300 md:text-lg">
						Route production traffic through one gateway, keep your OpenAI-style SDK ergonomics, and swap between leading model families without rewriting your app every sprint.
					</p>
				</div>
				<div className="grid gap-3 md:grid-cols-3">
					{PROOF_POINTS.map((point) => {
						const Icon = point.icon;
						return (
							<div
								key={point.title}
								className="rounded-[24px] border border-zinc-200/80 bg-white/90 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] dark:border-zinc-800/80 dark:bg-zinc-950/70 dark:shadow-none"
							>
								<div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
									<Icon className="h-4 w-4 text-zinc-700 dark:text-zinc-200" />
								</div>
								<h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
									{point.title}
								</h3>
								<p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
									{point.body}
								</p>
							</div>
						);
					})}
				</div>
				<div className="flex flex-wrap gap-3">
					<Button asChild size="lg" className="h-11 rounded-full px-6 text-sm font-semibold">
						<Link href="/sign-up">
							Start building
							<ArrowRight className="h-4 w-4" />
						</Link>
					</Button>
					<Button asChild size="lg" variant="outline" className="h-11 rounded-full px-6 text-sm font-semibold">
						<Link href={DOCS_HREF}>Read the quickstart</Link>
					</Button>
				</div>
			</div>
			<InlineModelCodeBlock
				language={language}
				model={activeModel}
				modelOptions={availableModels}
				onSelectModel={setActiveModelId}
				onSelectLanguage={setLanguageId}
			/>
		</section>
	);
}
