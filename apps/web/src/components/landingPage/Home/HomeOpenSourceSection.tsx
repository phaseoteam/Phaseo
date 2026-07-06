"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
	ArrowRight,
	Check,
	ChevronDown,
	Copy,
	MessageSquare,
	TerminalSquare,
} from "lucide-react";
import {
	codeToTokensBoth,
	type CodeTokensWithThemesResult,
	type ShikiLang,
} from "@/components/(data)/model/quickstart/shiki";
import { Logo } from "@/components/Logo";
import { GitHubBrandIcon } from "@/components/icons/SocialBrandIcons";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const CTA_TICKER_PROVIDERS = [
	{ id: "openai", label: "OpenAI" },
	{ id: "anthropic", label: "Anthropic" },
	{ id: "google", label: "Google" },
	{ id: "xai", label: "xAI" },
	{ id: "mistral", label: "Mistral" },
	{ id: "deepseek", label: "DeepSeek" },
	{ id: "minimax", label: "MiniMax" },
	{ id: "zai", label: "Z-AI" },
	{ id: "moonshotai", label: "Moonshot" },
] as const;

type FirstPromptSnippet = {
	id:
		| "curl"
		| "typescript"
		| "python"
		| "javascript"
		| "go"
		| "php"
		| "java"
		| "csharp";
	label:
		| "cURL"
		| "TypeScript"
		| "Python"
		| "JavaScript"
		| "Go"
		| "PHP"
		| "Java"
		| "C#";
	lang: ShikiLang;
	code: (modelId: string) => string;
};

type HomeOpenSourceVariant = "default" | "beta";

const ROTATING_MODEL_IDS = [
	"openai/gpt-5.5",
	"anthropic/claude-opus-4.7",
	"google/gemini-3.1-pro-preview",
	"x-ai/grok-4.20-beta-0309",
	"mistral/mistral-medium-3.5",
] as const;

const MODEL_TYPING_IDLE_MS = 1400;
const MODEL_TYPING_BACKSPACE_MS = 28;
const MODEL_TYPING_FORWARD_MS = 36;

const FIRST_PROMPT_SNIPPETS: readonly FirstPromptSnippet[] = [
	{
		id: "curl",
		label: "cURL",
		lang: "bash",
		code: (modelId) => `curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "input": "Write a one-line welcome message for a new user."
  }'`,
	},
	{
		id: "typescript",
		label: "TypeScript",
		lang: "ts",
		code: (modelId) => `const response = await fetch("https://api.phaseo.app/v1/responses", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.PHASEO_API_KEY!}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${modelId}",
    input: "Write a one-line welcome message for a new user.",
  }),
});

const data = await response.json();
console.log(data);`,
	},
	{
		id: "python",
		label: "Python",
		lang: "python",
		code: (modelId) => `import os
import requests

response = requests.post(
    "https://api.phaseo.app/v1/responses",
    headers={
        "Authorization": f"Bearer {os.environ['PHASEO_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
        "model": "${modelId}",
        "input": "Write a one-line welcome message for a new user.",
    },
)

print(response.json())`,
	},
	{
		id: "javascript",
		label: "JavaScript",
		lang: "js",
		code: (modelId) => `const response = await fetch("https://api.phaseo.app/v1/responses", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.PHASEO_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${modelId}",
    input: "Write a one-line welcome message for a new user.",
  }),
});

console.log(await response.json());`,
	},
	{
		id: "go",
		label: "Go",
		lang: "go",
		code: (modelId) => `package main

import (
  "bytes"
  "fmt"
  "net/http"
  "os"
)

func main() {
  body := []byte(\`{
    "model": "${modelId}",
    "input": "Write a one-line welcome message for a new user."
  }\`)
  req, _ := http.NewRequest(
    "POST",
    "https://api.phaseo.app/v1/responses",
    bytes.NewBuffer(body),
  )
  req.Header.Set("Authorization", "Bearer "+os.Getenv("PHASEO_API_KEY"))
  req.Header.Set("Content-Type", "application/json")

  res, _ := http.DefaultClient.Do(req)
  defer res.Body.Close()

  fmt.Println(res.Status)
}`,
	},
	{
		id: "php",
		label: "PHP",
		lang: "php",
		code: (modelId) => `<?php

$payload = json_encode([
  "model" => "${modelId}",
  "input" => "Write a one-line welcome message for a new user.",
]);

$ch = curl_init("https://api.phaseo.app/v1/responses");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer " . getenv("PHASEO_API_KEY"),
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => $payload,
  CURLOPT_RETURNTRANSFER => true,
]);

echo curl_exec($ch);
curl_close($ch);`,
	},
	{
		id: "java",
		label: "Java",
		lang: "java",
		code: (modelId) => `var body = """
  {
    "model": "${modelId}",
    "input": "Write a one-line welcome message for a new user."
  }
  """;

var request = java.net.http.HttpRequest.newBuilder()
  .uri(java.net.URI.create("https://api.phaseo.app/v1/responses"))
  .header("Authorization", "Bearer " + System.getenv("PHASEO_API_KEY"))
  .header("Content-Type", "application/json")
  .POST(java.net.http.HttpRequest.BodyPublishers.ofString(body))
  .build();`,
	},
	{
		id: "csharp",
		label: "C#",
		lang: "csharp",
		code: (modelId) => `using System.Net.Http.Headers;
using System.Text;

var client = new HttpClient();
client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
    "Bearer",
    Environment.GetEnvironmentVariable("PHASEO_API_KEY")
);

var body = """
{
  "model": "${modelId}",
  "input": "Write a one-line welcome message for a new user."
}
""";

var response = await client.PostAsync(
    "https://api.phaseo.app/v1/responses",
    new StringContent(body, Encoding.UTF8, "application/json")
);`,
	},
] as const;

type SnippetId = (typeof FIRST_PROMPT_SNIPPETS)[number]["id"];
type TokenLine = CodeTokensWithThemesResult[number];
type Token = TokenLine[number];

const SNIPPET_LOGOS: Partial<Record<SnippetId, string>> = {
	typescript: "typescript",
	python: "python",
	javascript: "javascript",
	go: "go",
	php: "php",
	java: "java",
	csharp: "csharp",
};

const PRIMARY_SNIPPET_IDS = ["curl", "typescript", "python"] as const satisfies readonly SnippetId[];
const PRIMARY_SNIPPET_ID_SET = new Set<SnippetId>(PRIMARY_SNIPPET_IDS);
const PRIMARY_SNIPPETS = FIRST_PROMPT_SNIPPETS.filter((snippet) =>
	PRIMARY_SNIPPET_ID_SET.has(snippet.id)
);
const MORE_SNIPPETS = FIRST_PROMPT_SNIPPETS.filter(
	(snippet) => !PRIMARY_SNIPPET_ID_SET.has(snippet.id)
);

function SnippetIcon({ id, active = false }: { id: SnippetId; active?: boolean }) {
	const logoId = SNIPPET_LOGOS[id];
	if (logoId) {
		return (
			<span className="relative h-3.5 w-3.5">
				<Logo
					id={logoId}
					variant={active ? "mono" : "color"}
					forceTheme={active ? "dark" : undefined}
					fill
					sizes="14px"
					className="object-contain object-center"
				/>
			</span>
		);
	}

	return <TerminalSquare className="h-3.5 w-3.5" />;
}

function getReadableDarkTokenColor(color?: string) {
	const normalized = color?.trim().toLowerCase();
	if (!normalized) return "#e4e4e7";

	switch (normalized) {
		case "#005cc5":
		case "#032f62":
		case "#0366d6":
			return "#60a5fa";
		case "#6f42c1":
		case "#5a32a3":
			return "#a78bfa";
		case "#22863a":
		case "#28a745":
			return "#4ade80";
		case "#d73a49":
		case "#cb2431":
			return "#fb7185";
		case "#e36209":
		case "#b31d28":
			return "#fbbf24";
		case "#24292e":
		case "#586069":
		case "#6a737d":
			return "#d4d4d8";
		default:
			return color ?? "#e4e4e7";
	}
}

function getTokenStyle(token: Token): CSSProperties {
	const light = token.variants.light;
	const dark = token.variants.dark;
	const fontStyle = light.fontStyle ?? 0;
	const style: CSSProperties & Record<string, string | number> = {
		"--token-light": light.color ?? "currentColor",
		"--token-dark": getReadableDarkTokenColor(dark.color ?? light.color),
	};

	if (fontStyle & 1) style.fontStyle = "italic";
	if (fontStyle & 2) style.fontWeight = 600;
	if (fontStyle & 4) style.textDecoration = "underline";

	return style;
}

function FirstPromptCodeBlock({
	activeSnippet,
	snippetId,
	modelId,
	copyModelId,
	variant,
	onSelectSnippet,
}: {
	activeSnippet: FirstPromptSnippet;
	snippetId: SnippetId;
	modelId: string;
	copyModelId?: string;
	variant: HomeOpenSourceVariant;
	onSelectSnippet: (id: SnippetId) => void;
}) {
	const [copied, setCopied] = useState(false);
	const [tokens, setTokens] = useState<CodeTokensWithThemesResult | null>(null);
	const [error, setError] = useState(false);
	const copyResetTimeoutRef = useRef<number | null>(null);
	const selectedMoreSnippet =
		!PRIMARY_SNIPPET_ID_SET.has(snippetId)
			? MORE_SNIPPETS.find((snippet) => snippet.id === snippetId) ?? null
			: null;

	useEffect(() => {
		let mounted = true;
		setTokens(null);

		async function highlight() {
			try {
				const rendered = await codeToTokensBoth(
					activeSnippet.code(modelId),
					activeSnippet.lang
				);
				if (!mounted) return;
				setTokens(rendered);
				setError(false);
			} catch (err) {
				console.error("[HomeOpenSourceSection] highlight failed", err);
				if (mounted) setError(true);
			}
		}

		void highlight();
		return () => {
			mounted = false;
		};
	}, [activeSnippet, modelId]);

	useEffect(() => {
		return () => {
			if (copyResetTimeoutRef.current) {
				window.clearTimeout(copyResetTimeoutRef.current);
			}
		};
	}, []);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(
			activeSnippet.code(copyModelId ?? modelId)
		);
		if (copyResetTimeoutRef.current) {
			window.clearTimeout(copyResetTimeoutRef.current);
		}
		setCopied(true);
		copyResetTimeoutRef.current = window.setTimeout(() => {
			setCopied(false);
			copyResetTimeoutRef.current = null;
		}, 1700);
	};

	return (
		<div className="mt-3 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/70">
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 px-3 py-2 dark:border-zinc-800">
				<div className="flex flex-wrap items-center gap-1.5">
					{(variant === "beta" ? PRIMARY_SNIPPETS : FIRST_PROMPT_SNIPPETS.slice(0, 3)).map((snippet) => {
						return (
						<button
							key={snippet.id}
							type="button"
							onClick={() => onSelectSnippet(snippet.id)}
							className={cn(
								"inline-flex items-center gap-1.25 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
								snippet.id === snippetId
									? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
									: "border-zinc-200/80 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
							)}
						>
							<SnippetIcon
								id={snippet.id}
								active={snippet.id === snippetId}
							/>
							{snippet.label}
						</button>
						);
					})}
					{variant === "beta" ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className={cn(
										"inline-flex items-center gap-1.25 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
										!PRIMARY_SNIPPET_ID_SET.has(snippetId)
											? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
											: "border-zinc-200/80 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
									)}
								>
									{selectedMoreSnippet ? (
										<>
											<SnippetIcon
												id={selectedMoreSnippet.id}
												active
											/>
											{selectedMoreSnippet.label}
										</>
									) : (
										"More"
									)}
									<ChevronDown className="h-3.5 w-3.5" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="min-w-40">
								{MORE_SNIPPETS.map((snippet) => (
									<DropdownMenuItem
										key={snippet.id}
										onSelect={() => onSelectSnippet(snippet.id)}
										className="gap-2"
									>
										<SnippetIcon id={snippet.id} />
										<span>{snippet.label}</span>
										{snippet.id === snippetId ? <Check className="ml-auto h-3.5 w-3.5" /> : null}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
				</div>
				<button
					type="button"
					onClick={handleCopy}
					className={cn(
						"inline-flex items-center rounded-md border border-zinc-200/80 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 transition-all duration-200 ease-out hover:border-zinc-300 hover:text-zinc-900 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-100",
						copied && "border-zinc-300 text-zinc-900 dark:border-zinc-600 dark:text-zinc-100"
					)}
				>
					<span className="relative mr-1.25 h-3.5 w-3.5">
						<Copy
							className={cn(
								"absolute inset-0 h-3.5 w-3.5 transition-all duration-200 ease-out",
								copied ? "translate-y-0.5 scale-90 opacity-0" : "translate-y-0 scale-100 opacity-100"
							)}
						/>
						<Check
							className={cn(
								"absolute inset-0 h-3.5 w-3.5 transition-all duration-200 ease-out",
								copied ? "translate-y-0 scale-100 opacity-100" : "-translate-y-0.5 scale-90 opacity-0"
							)}
						/>
					</span>
					<span
						className={cn(
							"relative inline-block h-4 overflow-hidden text-left transition-[width] duration-200 ease-out",
							copied ? "w-[2.85rem]" : "w-[1.95rem]"
						)}
					>
						<span
							className={cn(
								"absolute inset-0 transition-all duration-200 ease-out",
								copied ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"
							)}
						>
							Copy
						</span>
						<span
							className={cn(
								"absolute inset-0 transition-all duration-200 ease-out",
								copied ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
							)}
						>
							Copied
						</span>
					</span>
				</button>
			</div>
			{!error && tokens ? (
				<pre className="overflow-x-auto px-4 py-4 text-[13px] leading-6 text-zinc-900 dark:text-zinc-200">
					<code>
						{tokens.map((line: TokenLine, lineIndex: number) => (
							<span key={lineIndex} className="block min-h-6">
								{line.length > 0 ? (
									line.map((token: Token, tokenIndex: number) => (
										<span
											key={`${lineIndex}-${tokenIndex}`}
											style={getTokenStyle(token)}
											className="[color:var(--token-light)] dark:[color:var(--token-dark)]"
										>
											{token.content}
										</span>
									))
								) : (
									<span>&nbsp;</span>
								)}
							</span>
						))}
					</code>
				</pre>
			) : (
				<pre className="overflow-x-auto px-4 py-4 text-[13px] leading-6 text-zinc-900 dark:text-zinc-200">
					<code>{activeSnippet.code(modelId)}</code>
				</pre>
			)}
		</div>
	);
}

function TickerLogo({
	id,
	variant = "color",
}: {
	id: string;
	variant?: "auto" | "color";
}) {
	return (
		<span className="flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200/80 bg-white dark:border-zinc-700 dark:bg-zinc-950">
			<span className="relative h-4 w-4">
				<Logo
					id={id}
					variant={variant}
					fill
					sizes="16px"
					className="object-contain object-center"
				/>
			</span>
		</span>
	);
}

function SharedProviderTicker({
	currentId,
	incomingId,
	isSliding,
	ariaLabel,
}: {
	currentId: string;
	incomingId: string;
	isSliding: boolean;
	ariaLabel: string;
}) {
	return (
		<span
			className="relative inline-flex h-7 w-7 overflow-hidden align-middle"
			aria-label={ariaLabel}
		>
			<span
				className={`absolute inset-0 ${isSliding ? "transition-transform duration-300 ease-out" : "transition-none"}`}
				style={{ transform: isSliding ? "translateY(-100%)" : "translateY(0%)" }}
				aria-hidden="true"
			>
				<span className="flex h-7 w-7 items-center justify-center">
					<TickerLogo id={currentId} variant="color" />
				</span>
				<span className="flex h-7 w-7 items-center justify-center">
					<TickerLogo id={incomingId} variant="color" />
				</span>
			</span>
		</span>
	);
}

export default function HomeOpenSourceSection({
	variant = "default",
}: {
	variant?: HomeOpenSourceVariant;
}) {
	const [snippetId, setSnippetId] = useState<SnippetId>("curl");
	const [modelIndex, setModelIndex] = useState(0);
	const [ctaTickerIndex, setCtaTickerIndex] = useState(0);
	const [nextCtaTickerIndex, setNextCtaTickerIndex] = useState<number | null>(null);
	const [isCtaTickerSliding, setIsCtaTickerSliding] = useState(false);
	const [displayedModelId, setDisplayedModelId] = useState<string>(
		ROTATING_MODEL_IDS[0]
	);
	const [modelAnimationPhase, setModelAnimationPhase] = useState<
		"idle" | "deleting" | "typing"
	>("idle");
	const activeSnippet =
		FIRST_PROMPT_SNIPPETS.find((snippet) => snippet.id === snippetId) ??
		FIRST_PROMPT_SNIPPETS[0];
	const isDisplayedModelComplete = ROTATING_MODEL_IDS.includes(
		displayedModelId as (typeof ROTATING_MODEL_IDS)[number]
	);
	const activeModelId =
		variant === "beta"
			? displayedModelId
			: ROTATING_MODEL_IDS[0];
	const stableCopyModelId =
		variant === "beta"
			? isDisplayedModelComplete
				? displayedModelId
				: (ROTATING_MODEL_IDS[modelIndex] ?? ROTATING_MODEL_IDS[0])
			: ROTATING_MODEL_IDS[0];
	const currentTickerProvider =
		CTA_TICKER_PROVIDERS[ctaTickerIndex] ?? CTA_TICKER_PROVIDERS[0];
	const incomingTickerProvider =
		CTA_TICKER_PROVIDERS[nextCtaTickerIndex ?? ctaTickerIndex] ??
		CTA_TICKER_PROVIDERS[0];

	useEffect(() => {
		if (variant === "beta") {
			setModelIndex(0);
			setCtaTickerIndex(0);
			setNextCtaTickerIndex(null);
			setIsCtaTickerSliding(false);
			setDisplayedModelId(ROTATING_MODEL_IDS[0]);
			setModelAnimationPhase("idle");
			return;
		}

		setModelIndex(0);
		setCtaTickerIndex(0);
		setNextCtaTickerIndex(null);
		setIsCtaTickerSliding(false);
		setDisplayedModelId(ROTATING_MODEL_IDS[0]);
		setModelAnimationPhase("idle");
	}, [variant]);

	useEffect(() => {
		if (variant !== "beta" || isCtaTickerSliding) return;

		const timeout = window.setTimeout(() => {
			setNextCtaTickerIndex(
				(ctaTickerIndex + 1) % CTA_TICKER_PROVIDERS.length
			);
			setIsCtaTickerSliding(true);
		}, 1750);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [ctaTickerIndex, isCtaTickerSliding, variant]);

	useEffect(() => {
		if (!isCtaTickerSliding || nextCtaTickerIndex === null) return;

		const timeout = window.setTimeout(() => {
			setCtaTickerIndex(nextCtaTickerIndex);
			setNextCtaTickerIndex(null);
			setIsCtaTickerSliding(false);
		}, 320);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [isCtaTickerSliding, nextCtaTickerIndex]);

	useEffect(() => {
		if (variant !== "beta") return;

		const targetModelId = ROTATING_MODEL_IDS[modelIndex] ?? ROTATING_MODEL_IDS[0];

		if (modelAnimationPhase === "idle") {
			const timeout = window.setTimeout(() => {
				setModelAnimationPhase("deleting");
			}, MODEL_TYPING_IDLE_MS);

			return () => {
				window.clearTimeout(timeout);
			};
		}

		if (modelAnimationPhase === "deleting") {
			if (displayedModelId.length === 0) {
				setModelIndex((current) => (current + 1) % ROTATING_MODEL_IDS.length);
				setModelAnimationPhase("typing");
				return;
			}

			const timeout = window.setTimeout(() => {
				setDisplayedModelId((current) => current.slice(0, -1));
			}, MODEL_TYPING_BACKSPACE_MS);

			return () => {
				window.clearTimeout(timeout);
			};
		}

		if (displayedModelId === targetModelId) {
			setModelAnimationPhase("idle");
			return;
		}

		const timeout = window.setTimeout(() => {
			setDisplayedModelId(targetModelId.slice(0, displayedModelId.length + 1));
		}, MODEL_TYPING_FORWARD_MS);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [displayedModelId, modelAnimationPhase, modelIndex, variant]);

	return (
		<section className="w-full pb-4">
			<div className="space-y-6">
				<div className="space-y-4 text-center">
					<h2 className="text-3xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50 sm:text-4xl">
						Build on the World&apos;s Largest Open Source AI Gateway.
					</h2>
					<p className="mx-auto max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300 md:text-lg">
						Ship with one OpenAI-compatible integration, broad provider coverage, and
						production-grade reliability, without lock-in or black-box infrastructure.
					</p>
				</div>
				<div className="mx-auto flex w-full max-w-2xl flex-col gap-3 border-t border-zinc-200/80 pt-4 dark:border-zinc-800/80">
					<div className="rounded-xl border border-zinc-200/80 bg-white/90 p-4 text-left dark:border-zinc-800 dark:bg-zinc-950/80">
						<p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
							Send your first request in under five minutes.
						</p>
						<p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
							Swap only the <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-900">model</code> ID to route any supported model through the same API.
						</p>
						<FirstPromptCodeBlock
							activeSnippet={activeSnippet}
							snippetId={snippetId}
							modelId={activeModelId}
							copyModelId={stableCopyModelId}
							variant={variant}
							onSelectSnippet={setSnippetId}
						/>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<Button
							asChild
							variant="outline"
							className="h-10 rounded-xl px-5 text-sm font-semibold"
						>
								<Link href={variant === "beta" ? "/models" : "https://docs.phaseo.app/v1/quickstart"}>
									{variant === "beta" ? (
										<span className="group inline-flex items-center gap-2">
											<span>Explore</span>
											<SharedProviderTicker
												currentId={currentTickerProvider.id}
												incomingId={incomingTickerProvider.id}
												isSliding={isCtaTickerSliding}
												ariaLabel={`${currentTickerProvider.label} provider`}
											/>
											<span>Models</span>
										</span>
									) : (
									<>
										Read docs
										<ArrowRight className="h-4 w-4" />
									</>
								)}
							</Link>
						</Button>
						<Button asChild variant="default" className="h-10 rounded-xl px-5 text-sm font-semibold">
							<Link href="/settings/keys">
								Get API Key
								<ArrowRight className="h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="outline" className="h-10 rounded-xl px-5 text-sm font-semibold">
							<Link href="https://github.com/phaseoteam/Phaseo">
								<GitHubBrandIcon className="h-4 w-4" />
								View GitHub
							</Link>
						</Button>
						<Button asChild variant="outline" className="h-10 rounded-xl px-4 text-sm font-semibold">
							<Link href="/migrate">
								<span className="inline-flex shrink-0 items-center gap-1.25">
									<SharedProviderTicker
										currentId={currentTickerProvider.id}
										incomingId={incomingTickerProvider.id}
										isSliding={isCtaTickerSliding}
										ariaLabel={`${currentTickerProvider.label} provider`}
									/>
									<ArrowRight className="h-3.25 w-3.25 text-zinc-500/80 dark:text-zinc-400/80" />
									<TickerLogo id="ai-stats" variant="auto" />
								</span>
								Migration guide
							</Link>
						</Button>
					</div>
					<div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div className="text-left">
								<p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
									Prefer not to integrate APIs yet?
								</p>
								<p className="text-sm text-zinc-600 dark:text-zinc-300">
									Use Chat to test models in the browser and compare outputs with no code.
								</p>
							</div>
							<Button asChild variant="outline" className="h-9 rounded-xl px-4 text-sm font-semibold sm:shrink-0">
								<Link href="/chat">
									<MessageSquare className="h-4 w-4" />
									Try Chat
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

