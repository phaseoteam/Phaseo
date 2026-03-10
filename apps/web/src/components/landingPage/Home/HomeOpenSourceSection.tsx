"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
	ArrowRight,
	BookOpen,
	Check,
	Copy,
	Github,
	MessageSquare,
	TerminalSquare,
} from "lucide-react";
import {
	codeToTokensBoth,
	type CodeTokensWithThemesResult,
	type ShikiLang,
} from "@/components/(data)/model/quickstart/shiki";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIGRATION_FLOW_LOGOS = [
	"openai",
	"anthropic",
	"google",
	"openrouter",
] as const;

type FirstPromptSnippet = {
	id: "curl" | "typescript" | "python";
	label: "cURL" | "TypeScript" | "Python";
	lang: ShikiLang;
	code: string;
};

const FIRST_PROMPT_SNIPPETS: readonly FirstPromptSnippet[] = [
	{
		id: "curl",
		label: "cURL",
		lang: "bash",
		code: `curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $AI_STATS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-5.4",
    "input": "Write a one-line welcome message for a new user."
  }'`,
	},
	{
		id: "typescript",
		label: "TypeScript",
		lang: "ts",
		code: `const response = await fetch("https://api.phaseo.app/v1/responses", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.AI_STATS_API_KEY!}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "openai/gpt-5.4",
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
		code: `import os
import requests

response = requests.post(
    "https://api.phaseo.app/v1/responses",
    headers={
        "Authorization": f"Bearer {os.environ['AI_STATS_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
        "model": "openai/gpt-5.4",
        "input": "Write a one-line welcome message for a new user.",
    },
)

print(response.json())`,
	},
] as const;

type SnippetId = (typeof FIRST_PROMPT_SNIPPETS)[number]["id"];
type TokenLine = CodeTokensWithThemesResult[number];
type Token = TokenLine[number];

const SNIPPET_LOGOS: Partial<Record<SnippetId, string>> = {
	typescript: "typescript",
	python: "python",
};

function SnippetIcon({ id }: { id: SnippetId }) {
	const logoId = SNIPPET_LOGOS[id];
	if (logoId) {
		return (
			<span className="relative h-3.5 w-3.5">
				<Logo
					id={logoId}
					variant="color"
					fill
					sizes="14px"
					className="object-contain object-center"
				/>
			</span>
		);
	}

	return <TerminalSquare className="h-3.5 w-3.5" />;
}

function getTokenStyle(token: Token): CSSProperties {
	const light = token.variants.light;
	const dark = token.variants.dark;
	const fontStyle = light.fontStyle ?? 0;
	const style: CSSProperties & Record<string, string | number> = {
		color: light.color ?? "currentColor",
		"--token-dark": dark.color ?? light.color ?? "currentColor",
	};

	if (fontStyle & 1) style.fontStyle = "italic";
	if (fontStyle & 2) style.fontWeight = 600;
	if (fontStyle & 4) style.textDecoration = "underline";

	return style;
}

function FirstPromptCodeBlock({
	activeSnippet,
	snippetId,
	onSelectSnippet,
}: {
	activeSnippet: FirstPromptSnippet;
	snippetId: SnippetId;
	onSelectSnippet: (id: SnippetId) => void;
}) {
	const [copied, setCopied] = useState(false);
	const [tokens, setTokens] = useState<CodeTokensWithThemesResult | null>(null);
	const [error, setError] = useState(false);
	const copyResetTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		let mounted = true;
		setTokens(null);

		async function highlight() {
			try {
				const rendered = await codeToTokensBoth(
					activeSnippet.code,
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
	}, [activeSnippet.code, activeSnippet.lang]);

	useEffect(() => {
		return () => {
			if (copyResetTimeoutRef.current) {
				window.clearTimeout(copyResetTimeoutRef.current);
			}
		};
	}, []);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(activeSnippet.code);
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
		<div className="mt-3 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-950/70">
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 px-3 py-2 dark:border-zinc-800">
				<div className="flex flex-wrap items-center gap-1.5">
					{FIRST_PROMPT_SNIPPETS.map((snippet) => {
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
							<SnippetIcon id={snippet.id} />
							{snippet.label}
						</button>
						);
					})}
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
				<pre className="overflow-x-auto px-4 py-4 text-[13px] leading-6 text-zinc-900 dark:text-zinc-100">
					<code>
						{tokens.map((line: TokenLine, lineIndex: number) => (
							<span key={lineIndex} className="block min-h-6">
								{line.length > 0 ? (
									line.map((token: Token, tokenIndex: number) => (
										<span
											key={`${lineIndex}-${tokenIndex}`}
											style={getTokenStyle(token)}
											className="dark:[color:var(--token-dark)]"
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
				<pre className="overflow-x-auto px-4 py-4 text-[13px] leading-6 text-zinc-900 dark:text-zinc-100">
					<code>{activeSnippet.code}</code>
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

function MigrationFlowTicker() {
	const [logoIndex, setLogoIndex] = useState(0);
	const [nextLogoIndex, setNextLogoIndex] = useState<number | null>(null);
	const [isSliding, setIsSliding] = useState(false);

	const sourceId = MIGRATION_FLOW_LOGOS[logoIndex] ?? "openai";
	const incomingId = MIGRATION_FLOW_LOGOS[nextLogoIndex ?? logoIndex] ?? "openai";

	useEffect(() => {
		const interval = window.setInterval(() => {
			setNextLogoIndex((logoIndex + 1) % MIGRATION_FLOW_LOGOS.length);
			setIsSliding(true);
		}, 1750);

		return () => {
			window.clearInterval(interval);
		};
	}, [logoIndex]);

	useEffect(() => {
		if (!isSliding || nextLogoIndex === null) return;

		const timeout = window.setTimeout(() => {
			setLogoIndex(nextLogoIndex);
			setNextLogoIndex(null);
			setIsSliding(false);
		}, 320);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [isSliding, nextLogoIndex]);

	return (
		<span className="inline-flex shrink-0 items-center gap-1.25">
			<span className="relative h-6 w-6 overflow-hidden">
				<span
					className={`absolute inset-0 ${isSliding ? "transition-transform duration-300 ease-out" : "transition-none"}`}
					style={{ transform: isSliding ? "translateY(-100%)" : "translateY(0%)" }}
				>
					<span className="flex h-6 w-6 items-center justify-center">
						<TickerLogo id={sourceId} variant="color" />
					</span>
					<span className="flex h-6 w-6 items-center justify-center">
						<TickerLogo id={incomingId} variant="color" />
					</span>
				</span>
			</span>
			<ArrowRight className="h-3.25 w-3.25 text-zinc-500/80 dark:text-zinc-400/80" />
			<TickerLogo id="ai-stats" variant="auto" />
		</span>
	);
}

export default function HomeOpenSourceSection() {
	const [snippetId, setSnippetId] = useState<SnippetId>("curl");
	const activeSnippet =
		FIRST_PROMPT_SNIPPETS.find((snippet) => snippet.id === snippetId) ??
		FIRST_PROMPT_SNIPPETS[0];

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
							onSelectSnippet={setSnippetId}
						/>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<Button asChild variant="outline" className="h-10 rounded-xl px-5 text-sm font-semibold">
							<Link href="https://docs.ai-stats.phaseo.app/v1/quickstart">
								<BookOpen className="h-4 w-4" />
								Read docs
							</Link>
						</Button>
						<Button asChild className="h-10 rounded-xl px-5 text-sm font-semibold">
							<Link href="/settings/keys">
								Get API Key
								<ArrowRight className="h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="outline" className="h-10 rounded-xl px-5 text-sm font-semibold">
							<Link href="https://github.com/AI-Stats/AI-Stats">
								<Github className="h-4 w-4" />
								View GitHub
							</Link>
						</Button>
						<Button asChild variant="outline" className="h-10 rounded-xl px-4 text-sm font-semibold">
							<Link href="/migrate">
								<MigrationFlowTicker />
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

