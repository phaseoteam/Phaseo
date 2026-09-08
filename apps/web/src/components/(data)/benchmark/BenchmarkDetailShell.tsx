import { ReactNode } from "react";
import Image from "next/image";
import { Trophy } from "lucide-react";
import { ArtificialAnalysisLogo } from "@/components/ArtificialAnalysisLogo";
import { isArtificialAnalysisBenchmark } from "@/lib/benchmarks/artificialAnalysis";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import EntityStickyHeader from "@/components/(data)/EntityStickyHeader";
import ModelPageToc, { type ModelPageTocItem } from "@/components/(data)/model/ModelPageToc";
import BenchmarkEditButton from "./edit/BenchmarkEditButton";

interface BenchmarkDetailShellProps {
	benchmark: BenchmarkPage;
	children: ReactNode;
	tocItems?: ModelPageTocItem[];
}

export default async function BenchmarkDetailShell({
	benchmark,
	children,
	tocItems = [],
}: BenchmarkDetailShellProps) {
	if (!benchmark) {
		return (
			<main className="flex min-h-screen flex-col">
				<div className="container mx-auto px-4 py-8">
					<div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center md:p-8">
						<p className="text-base font-medium">
							We don&apos;t know that benchmark... yet!
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							If we&apos;re missing a benchmark, please contribute
							on Github!
						</p>
						<div className="mt-3">
							<a
								href="https://github.com/phaseoteam/Phaseo"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
							>
								Contribute on GitHub
								<Image
									src="/social/github_light.svg"
									alt="GitHub Logo"
									width={16}
									height={16}
									className="inline dark:hidden"
								/>
								<Image
									src="/social/github_dark.svg"
									alt="GitHub Logo"
									width={16}
									height={16}
									className="hidden dark:inline"
								/>
							</a>
						</div>
					</div>
				</div>
			</main>
		);
	}
	const artificialAnalysis = isArtificialAnalysisBenchmark(benchmark.id);
	const artificialAnalysisMetric = benchmark.name?.replace(/^Artificial Analysis\s*/i, "").trim() || benchmark.id;

	return (
		<main className="flex flex-col">
			<EntityStickyHeader kind="benchmark" id={benchmark.id} name={artificialAnalysis ? "Artificial Analysis" : benchmark.name ?? benchmark.id} observeId="benchmark-detail-primary-header" baseHref={`/benchmarks/${benchmark.id}`} navigation={[]} />
			<div className="container mx-auto px-4 py-6 md:py-8">
				<div id="benchmark-detail-primary-header" className="mb-6 flex w-full items-start justify-between gap-4">
					<div className="flex min-w-0 items-center gap-4">
						<div className="flex size-14 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card/40">
							{artificialAnalysis ? <ArtificialAnalysisLogo size={32} /> : <Trophy className="size-7 text-muted-foreground" />}
						</div>
						<div className="min-w-0">
							<h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
								{artificialAnalysis ? "Artificial Analysis" : benchmark.name ?? benchmark.id}
							</h1>
							<p className="mt-1.5 text-sm text-muted-foreground">{artificialAnalysis ? `${artificialAnalysisMetric} · Independent evaluations` : "AI benchmark results and model performance"}</p>
						</div>
					</div>
					<BenchmarkEditButton benchmarkId={benchmark.id} />
				</div>
				<div className="mt-6 min-h-full">{tocItems.length ? <div className="flex flex-col gap-6 lg:flex-row lg:items-start"><ModelPageToc items={tocItems} className="lg:h-full lg:w-40 lg:shrink-0 xl:w-44" /><div className="min-w-0 flex-1">{children}</div></div> : children}</div>
			</div>
		</main>
	);
}
