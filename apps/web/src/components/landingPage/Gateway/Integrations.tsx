"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Code2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const INTEGRATIONS = [
	{
		label: "Vercel AI SDK",
		variant: "logo" as const,
		logo: "/logos/vercel_light.svg",
	},
	{
		label: "OpenAI SDK",
		variant: "logo" as const,
		logo: "/logos/openai_light.svg",
	},
	{
		label: "Anthropic SDK",
		variant: "logo" as const,
		logo: "/logos/anthropic_light.svg",
	},
	{ label: "Claude Code", variant: "text" as const },
	{ label: "Codex", variant: "text" as const },
	{ label: "OpenCode", variant: "text" as const },
	{ label: "AI Stats SDKs", variant: "pill" as const },
];

const CODE_SNIPPETS = [
	{
		id: "openai",
		label: "OpenAI SDK",
		language: "typescript",
		description:
			"Drop-in replacement — just change the base URL and keep your existing code.",
		code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AI_STATS_API_KEY!,
  baseURL: "https://gateway.ai-stats.phaseo.app/v1"
});

const response = await client.chat.completions.create({
  model: "openai/gpt-5.2",
  messages: [
    { role: "user", content: "Summarize the deployment status." }
  ]
});`,
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
  baseURL: "https://gateway.ai-stats.phaseo.app/v1"
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
				{/* Section header */}
				<div className="mx-auto max-w-3xl text-center">
					<Badge
						variant="secondary"
						className="mb-4 border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-600"
					>
						Integrations
					</Badge>
					<h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
						Drop Gateway into the stack you already ship
					</h2>
					<p className="mt-4 text-lg leading-relaxed text-slate-600">
						Keep compatibility with the SDKs your team uses, or move
						to the AI Stats SDK for advanced routing controls and
						telemetry.
					</p>
				</div>

				{/* Content grid */}
				<div className="mt-8 grid gap-6 lg:grid-cols-[1fr,1.2fr]">
					{/* Left: Integration logos */}
					<Card className="group relative overflow-hidden border border-slate-200/60 bg-white/90 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:border-slate-300/80 hover:-translate-y-1">
						{/* Hover gradient */}
						<div
							className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
							style={{
								background: `linear-gradient(135deg, #0ea5e910 0%, transparent 70%)`,
							}}
						/>
						<CardContent className="relative space-y-6 p-6">
							<div>
								<h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
									Compatible SDKs
								</h3>
								<p className="mt-2 text-sm text-slate-600">
									Use your existing SDK — just point it at the
									Gateway.
								</p>
							</div>

							{/* SDK logos */}
							<div className="grid grid-cols-3 gap-3">
								{INTEGRATIONS.filter(
									(item) => item.variant === "logo",
								).map((item) => (
									<div
										key={item.label}
										className="flex items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-5 transition-all duration-300 hover:bg-white hover:shadow-sm hover:border-slate-300/80 hover:-translate-y-0.5"
									>
										<Image
											src={item.logo!}
											alt={item.label}
											width={100}
											height={28}
											className="h-7 w-auto"
										/>
									</div>
								))}
							</div>

							{/* Text badges */}
							<div className="space-y-3">
								<h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
									Also works with
								</h4>
								<div className="flex flex-wrap gap-2">
									{INTEGRATIONS.filter(
										(item) => item.variant !== "logo",
									).map((item) => (
										<div
											key={item.label}
											className={cn(
												"rounded-full border px-4 py-2 text-sm font-medium transition-all duration-300",
												item.variant === "pill"
													? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
													: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300",
											)}
										>
											{item.label}
										</div>
										))}
								</div>
							</div>

							{/* Benefits */}
							<div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-4">
								<p className="text-sm text-slate-600">
									<span className="font-semibold text-slate-900">
										AI Stats SDKs
									</span>{" "}
									include typed routing policies, usage
									telemetry, and compatibility shims for all
									major providers.
								</p>
							</div>
						</CardContent>
					</Card>

					{/* Right: Code snippet */}
					<Card className="group relative overflow-hidden border border-slate-200/60 bg-white/90 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:border-slate-300/80 hover:-translate-y-1">
						{/* Hover gradient */}
						<div
							className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
							style={{
								background: `linear-gradient(135deg, #10b98110 0%, transparent 70%)`,
							}}
						/>
						<CardContent className="relative p-6">
							{/* Tabs */}
							<div className="mb-6 flex flex-wrap gap-2">
								{CODE_SNIPPETS.map((item) => (
									<button
										key={item.id}
										type="button"
										onClick={() => setActiveId(item.id)}
										className={cn(
											"rounded-full border px-4 py-2 text-sm font-medium transition-all duration-300",
											item.id === activeId
												? "border-slate-900 bg-slate-900 text-white shadow-sm"
												: "border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50",
										)}
									>
										{item.label}
									</button>
								))}
							</div>

							{/* Description */}
							<div className="mb-4 flex items-start gap-3">
								<div 
									className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110"
									style={{
										borderColor: `#10b98130`,
										backgroundColor: `#10b98108`,
									}}
								>
									<Code2 className="h-5 w-5" style={{ color: '#10b981' }} />
								</div>
								<div>
									<p className="font-medium text-slate-900">
										{activeSnippet?.label}
									</p>
									<p className="text-sm text-slate-600">
										{activeSnippet?.description}
									</p>
								</div>
							</div>

							{/* Code block */}
							<div className="relative">
								<div className="absolute right-3 top-3 z-10">
									<Button
										variant="ghost"
										size="sm"
										onClick={handleCopy}
										className="h-8 gap-2 bg-slate-800/50 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
									>
										{copied ? (
											<>
												<Check className="h-3.5 w-3.5" />
												Copied
											</>
										) : (
											<>
												<Copy className="h-3.5 w-3.5" />
												Copy
											</>
										)}
									</Button>
								</div>
								<pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm leading-relaxed text-slate-100 shadow-lg">
									<code className="whitespace-pre font-mono">
										{activeSnippet?.code}
									</code>
								</pre>
							</div>

							{/* Footer note */}
							<p className="mt-4 text-xs text-slate-500">
								All requests flow through the Gateway while
								preserving native SDK semantics and applying
								your routing policies.
							</p>
						</CardContent>
					</Card>
				</div>
			</div>
		</section>
	);
}
