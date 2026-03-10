"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	Check,
	Code2,
	Copy,
	Puzzle,
	ShieldCheck,
	TerminalSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

const INTEGRATIONS = [
	{
		label: "Vercel AI SDK",
		variant: "sdk" as const,
		logoId: "vercel",
		description: "Provider + model routing through AI SDK adapters.",
	},
	{
		label: "OpenAI SDK",
		variant: "sdk" as const,
		logoId: "openai",
		description: "Drop-in base URL swap with existing OpenAI code.",
	},
	{
		label: "Anthropic SDK",
		variant: "sdk" as const,
		logoId: "anthropic",
		description: "Native Anthropic SDK support with compatibility shims.",
	},
	{ label: "Claude Code", variant: "tool" as const },
	{ label: "Codex", variant: "tool" as const },
	{ label: "OpenCode", variant: "tool" as const },
	{ label: "AI Stats SDKs", variant: "native" as const },
];

const CODE_SNIPPETS = [
	{
		id: "openai",
		label: "OpenAI SDK",
		language: "typescript",
		description:
			"Drop-in replacement: change base URL and keep existing request shapes.",
		code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AI_STATS_API_KEY!,
  baseURL: "https://api.phaseo.app/v1"
});

const response = await client.chat.completions.create({
  model: "openai/gpt-5.2",
  messages: [
    { role: "user", content: "Summarize the deployment status." }
  ]
});`,
	},
	{
		id: "curl",
		label: "cURL",
		language: "bash",
		description:
			"Call the Gateway directly over HTTP with your API key and model ID.",
		code: `curl https://api.phaseo.app/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $AI_STATS_API_KEY" \\
  -d '{
    "model": "anthropic/claude-opus-4-6",
    "messages": [
      {
        "role": "user",
        "content": "Summarize our weekly rollout status in five bullets."
      }
    ]
  }'`,
	},
	{
		id: "anthropic",
		label: "Anthropic SDK",
		language: "typescript",
		description:
			"Native Anthropic SDK support with automatic request translation.",
		code: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.AI_STATS_API_KEY!,
  baseURL: "https://api.phaseo.app/v1"
});

const message = await client.messages.create({
  model: "anthropic/claude-opus-4.5",
  max_tokens: 512,
  messages: [
    { role: "user", content: "Draft the weekly update." }
  ]
});`,
	},
	{
		id: "ai-stats",
		label: "AI Stats SDK",
		language: "typescript",
		description:
			"Full-featured SDK with typed routing controls and built-in telemetry.",
		code: `import { GatewayClient } from "@ai-stats/sdk";

const client = new GatewayClient({
  apiKey: process.env.AI_STATS_API_KEY!
});

const result = await client.chat.completions.create({
  model: "google/gemini-3-pro-preview",
  routing: { strategy: "lowest-latency" },
  messages: [
    { role: "user", content: "Summarize the enterprise roadmap." }
  ]
});`,
	},
];

export function Integrations() {
	const [activeId, setActiveId] = useState(CODE_SNIPPETS[0].id);
	const [copied, setCopied] = useState(false);

	const sdkIntegrations = INTEGRATIONS.filter((item) => item.variant === "sdk");
	const toolIntegrations = INTEGRATIONS.filter((item) => item.variant !== "sdk");

	const activeSnippet = useMemo(
		() => CODE_SNIPPETS.find((item) => item.id === activeId),
		[activeId],
	);

	const handleCopy = async () => {
		if (!activeSnippet) return;
		await navigator.clipboard.writeText(activeSnippet.code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<section className="py-8">
			<div className="mx-auto px-6 lg:px-8">
				<div className="mx-auto max-w-3xl text-center">
					<Badge
						variant="secondary"
						className="mb-4 border border-zinc-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
					>
						Integrations
					</Badge>
					<h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">
						Drop Gateway into the stack you already ship
					</h2>
					<p className="mt-4 text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
						Keep your existing SDK ergonomics, or adopt AI Stats SDKs
						for typed routing and first-class observability.
					</p>
				</div>

				<div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
					<Card className="border border-zinc-200/70 bg-white/90 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-950/70">
						<CardContent className="space-y-6 p-6">
							<div className="flex items-start gap-3">
								<div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300">
									<Puzzle className="h-5 w-5" />
								</div>
								<div>
									<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
										Compatibility layer
									</h3>
									<p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
										Keep your SDK, move traffic to Gateway, and
										standardize routing and policies.
									</p>
								</div>
							</div>

							<div className="grid gap-3 md:grid-cols-2">
								{sdkIntegrations.map((item) => (
									<div
										key={item.label}
										className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
									>
										<div className="flex items-center gap-3">
											<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
												<Logo
													id={item.logoId}
													alt={item.label}
													width={22}
													height={22}
													className="h-5 w-5 object-contain"
												/>
											</div>
											<div className="min-w-0">
												<p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
													{item.label}
												</p>
												<p className="text-xs text-zinc-500 dark:text-zinc-400">
													{item.description}
												</p>
											</div>
										</div>
									</div>
								))}
							</div>

							<div className="space-y-3">
								<p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
									Works with
								</p>
								<div className="flex flex-wrap gap-2">
									{toolIntegrations.map((item) => (
										<div
											key={item.label}
											className={cn(
												"rounded-full border px-3.5 py-1.5 text-xs font-medium",
												item.variant === "native"
													? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
													: "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
											)}
										>
											{item.label}
										</div>
									))}
								</div>
							</div>

							<div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-4 dark:border-emerald-900/70 dark:bg-emerald-950/30">
								<p className="flex items-start gap-2 text-sm text-emerald-900 dark:text-emerald-100">
									<ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
									<span>
										Base URL + API key migration path, with typed routing
										controls available when you need deeper policy logic.
									</span>
								</p>
							</div>
						</CardContent>
					</Card>

					<Card className="border border-zinc-200/70 bg-white/90 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-950/70">
						<CardContent className="p-6">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div className="flex items-start gap-3">
									<div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
										<TerminalSquare className="h-5 w-5" />
									</div>
									<div>
										<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
											Drop-in snippets
										</h3>
										<p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
											Keep native SDK calls, route through AI Stats
											Gateway.
										</p>
									</div>
								</div>
								<Badge
									variant="secondary"
									className="border border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
								>
									{activeSnippet?.language ?? "typescript"}
								</Badge>
							</div>

							<div className="mt-5 flex flex-wrap gap-2">
								{CODE_SNIPPETS.map((item) => (
									<button
										key={item.id}
										type="button"
										onClick={() => setActiveId(item.id)}
										className={cn(
											"rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
											item.id === activeId
												? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
												: "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-100",
										)}
									>
										{item.label}
									</button>
								))}
							</div>

							<div className="mt-4 flex items-start gap-3">
								<div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
									<Code2 className="h-4 w-4" />
								</div>
								<div>
									<p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
										{activeSnippet?.label}
									</p>
									<p className="text-sm text-zinc-600 dark:text-zinc-300">
										{activeSnippet?.description}
									</p>
								</div>
							</div>

							<div className="relative mt-5 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-inner">
								<div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
									<div className="flex items-center gap-2">
										<span className="h-2 w-2 rounded-full bg-rose-400/80" />
										<span className="h-2 w-2 rounded-full bg-amber-400/80" />
										<span className="h-2 w-2 rounded-full bg-emerald-400/80" />
										<span className="ml-2 text-[11px] text-zinc-400">
											gateway.{activeSnippet?.id}.ts
										</span>
									</div>
									<Button
										variant="ghost"
										size="sm"
										onClick={handleCopy}
										className="h-7 gap-1.5 px-2 text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-white"
									>
										{copied ? (
											<>
												<Check className="h-3 w-3" />
												Copied
											</>
										) : (
											<>
												<Copy className="h-3 w-3" />
												Copy
											</>
										)}
									</Button>
								</div>
								<pre className="max-h-[420px] overflow-x-auto p-5 text-[13px] leading-6 text-zinc-100">
									<code className="whitespace-pre font-mono">
										{activeSnippet?.code}
									</code>
								</pre>
							</div>

							<p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
								Requests keep native SDK semantics while Gateway applies
								routing policy, telemetry, and fallback logic.
							</p>
						</CardContent>
					</Card>
				</div>
			</div>
		</section>
	);
}

