import { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { Trophy } from "lucide-react";
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
	const t = await getTranslations("Catalogue.benchmarks");
	if (!benchmark) {
		return (
			<main className="flex min-h-screen flex-col">
				<div className="container mx-auto px-4 py-8">
					<div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center md:p-8">
						<p className="text-base font-medium">
							{t("unknownBenchmarkTitle")}
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							{t("unknownBenchmarkDescription")}
						</p>
						<div className="mt-3">
							<a
								href="https://github.com/phaseoteam/Phaseo"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
							>
								{t("contributeGitHub")}
								<Image
									src="/social/github_light.svg"
									alt={t("githubLogoAlt")}
									width={16}
									height={16}
									className="inline dark:hidden"
								/>
								<Image
									src="/social/github_dark.svg"
									alt={t("githubLogoAlt")}
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

	return (
		<main className="flex flex-col">
			<EntityStickyHeader kind="benchmark" id={benchmark.id} name={benchmark.name ?? benchmark.id} observeId="benchmark-detail-primary-header" baseHref={`/benchmarks/${benchmark.id}`} navigation={[]} />
			<div className="container mx-auto px-4 py-6 md:py-8">
				<div id="benchmark-detail-primary-header" className="mb-6 flex w-full items-start justify-between gap-4">
					<div className="flex min-w-0 items-center gap-4">
						<div className="flex size-14 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card/40">
							<Trophy className="size-7 text-muted-foreground" />
						</div>
						<div className="min-w-0">
							<h1 className="truncate text-3xl font-bold tracking-tight">
								{benchmark.name ?? benchmark.id}
							</h1>
							<p className="mt-1.5 text-sm text-muted-foreground">{t("detailSubtitle")}</p>
						</div>
					</div>
					<BenchmarkEditButton benchmarkId={benchmark.id} />
				</div>
				<div className="mt-6 min-h-full">{tocItems.length ? <div className="flex flex-col gap-6 lg:flex-row lg:items-start"><ModelPageToc items={tocItems} className="lg:h-full lg:w-40 lg:shrink-0 xl:w-44" /><div className="min-w-0 flex-1">{children}</div></div> : children}</div>
			</div>
		</main>
	);
}
