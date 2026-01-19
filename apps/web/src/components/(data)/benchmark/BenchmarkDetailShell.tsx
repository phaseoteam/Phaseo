import { ReactNode } from "react";
import Image from "next/image";
import TabBar from "@/components/(data)/benchmark/BenchmarkTabs";
import { withUTM } from "@/lib/utm";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/getBenchmark";
import BenchmarkEditButton from "./edit/BenchmarkEditButton";

interface BenchmarkDetailShellProps {
	benchmark: BenchmarkPage;
	children: ReactNode;
}

export default async function BenchmarkDetailShell({
	benchmark,
	children,
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
								href={withUTM(
									"https://github.com/AI-Stats/AI-Stats",
									{
										campaign: "benchmark-empty-state",
										content: "benchmark-detail-shell",
									}
								)}
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

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8">
				<div className="mb-8 flex w-full flex-col items-center justify-between gap-2 md:flex-row md:items-start md:gap-0">
					<div className="flex flex-col items-center gap-4 md:flex-row">
						<div className="flex flex-col items-center justify-center md:items-start">
							<h1 className="mb-1 text-center text-3xl font-bold md:text-left md:text-5xl">
								{benchmark.name ?? benchmark.id}
							</h1>
						</div>
						<div className="ml-2">
							<BenchmarkEditButton benchmarkId={benchmark.id} />
						</div>
					</div>
				</div>

				<TabBar benchmarkId={benchmark.id} />

				<div className="mt-6">{children}</div>
			</div>
		</main>
	);
}
