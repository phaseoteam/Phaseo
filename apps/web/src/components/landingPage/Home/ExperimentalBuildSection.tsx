"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, MessageSquare } from "lucide-react";
import { GitHubBrandIcon } from "@/components/icons/SocialBrandIcons";
import { Button } from "@/components/ui/button";

const CODE_SNIPPET = `POST /v1/responses
{
  "model": "openai/gpt-5.4",
  "input": "Summarise the latest model release."
}`;

const ACTIONS = [
	{
		title: "Read the quickstart",
		body: "Understand the unified request shape and drop-in migration path.",
		href: "https://docs.phaseo.app/v1/quickstart",
		icon: BookOpen,
	},
	{
		title: "View the repository",
		body: "Inspect the open-source gateway, SDKs, and roadmap directly.",
		href: "https://github.com/phaseoteam/Phaseo",
		icon: GitHubBrandIcon,
	},
	{
		title: "Try Chat first",
		body: "Test models in the browser if you are still comparing behavior before integrating.",
		href: "/chat",
		icon: MessageSquare,
	},
] as const;

export default function ExperimentalBuildSection() {
	return (
		<section className="rounded-[2.25rem] border border-zinc-200/80 bg-white p-6 shadow-[0_24px_80px_rgba(24,22,18,0.05)] dark:border-zinc-800/80 dark:bg-zinc-950/78 sm:p-7">
			<div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
				<div className="space-y-5">
					<div className="space-y-3">
						<p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-500 dark:text-zinc-400">
							Build on the gateway
						</p>
						<h2 className="max-w-lg text-4xl font-semibold tracking-[-0.06em] text-zinc-950 dark:text-zinc-50">
							Integration should look calm here too.
						</h2>
						<p className="max-w-xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
							The experimental version keeps the setup section simpler: one clean
							request shape, a direct path into docs, and a few obvious next steps.
						</p>
					</div>

					<div className="overflow-hidden rounded-[1.7rem] border border-zinc-900/90 bg-zinc-950 text-white">
						<div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-zinc-400">
							<span>Quick request</span>
							<span>OpenAI-compatible</span>
						</div>
						<pre className="overflow-x-auto px-4 py-5 text-[13px] leading-7 text-zinc-200">
							<code>{CODE_SNIPPET}</code>
						</pre>
					</div>

					<div className="flex flex-col gap-3 sm:flex-row">
						<Button asChild className="h-11 rounded-full px-5 text-sm font-semibold">
							<Link href="/settings/keys">
								Get API Key
								<ArrowRight className="h-4 w-4" />
							</Link>
						</Button>
						<Button
							asChild
							variant="outline"
							className="h-11 rounded-full px-5 text-sm font-semibold"
						>
							<Link href="/migrate">Migration guide</Link>
						</Button>
					</div>
				</div>

				<div className="grid gap-4">
					{ACTIONS.map((action) => {
						const Icon = action.icon;
						return (
							<Link
								key={action.title}
								href={action.href}
								className="group rounded-[1.6rem] border border-zinc-200/80 bg-white p-5 transition-colors hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-900/55 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/70"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-950">
										<Icon className="h-5 w-5 text-zinc-900 dark:text-zinc-100" />
									</div>
									<ArrowRight className="h-4 w-4 text-zinc-500 transition-transform group-hover:translate-x-0.5 dark:text-zinc-400" />
								</div>
								<h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-zinc-950 dark:text-zinc-50">
									{action.title}
								</h3>
								<p className="mt-2 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
									{action.body}
								</p>
							</Link>
						);
					})}
				</div>
			</div>
		</section>
	);
}
