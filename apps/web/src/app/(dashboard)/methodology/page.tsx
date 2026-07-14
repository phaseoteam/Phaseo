import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { METHODOLOGY_ENTRIES } from "@/lib/content/methodology";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = buildMetadata({
	title: "Methodology",
	description:
		"Source-of-truth methodology pages covering how Phaseo calculates pricing, measures latency and throughput, normalises benchmarks, and tracks provider availability.",
	path: "/methodology",
	keywords: [
		"Phaseo methodology",
		"AI model pricing methodology",
		"AI benchmark methodology",
		"provider availability methodology",
	],
});

export default function MethodologyIndexPage() {
	return (
		<div className="container mx-auto max-w-4xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
			<header className="space-y-3">
				<div className="text-sm text-muted-foreground">
					Methodology
				</div>
				<h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
					How Phaseo measures what it publishes
				</h1>
				<p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
					Four reference pages covering how pricing, performance, benchmarks,
					and provider coverage are defined across the public catalog.
				</p>
			</header>

			<Separator className="bg-zinc-200/70 dark:bg-zinc-800/70" />

			<section className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
				{METHODOLOGY_ENTRIES.map((entry) => (
					<article
						key={entry.slug}
						className="grid gap-4 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
					>
						<div className="space-y-3">
							<p className="text-sm text-muted-foreground">{entry.shortTitle}</p>
							<h2 className="text-xl font-semibold tracking-tight text-foreground">
								{entry.title}
							</h2>
							<p className="text-sm leading-6 text-muted-foreground">
								{entry.description}
							</p>
							<p className="text-xs text-zinc-500 dark:text-zinc-400">
								Last updated {entry.lastUpdated}
							</p>
						</div>
						<div className="md:self-start">
							<Link
								href={entry.path}
								className="inline-flex items-center gap-1 text-sm font-medium text-foreground transition-colors hover:text-muted-foreground"
							>
								Read page
								<ArrowRight className="h-4 w-4" />
							</Link>
						</div>
					</article>
				))}
			</section>
		</div>
	);
}
