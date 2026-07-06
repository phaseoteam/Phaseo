import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

const SALES_HREF = "/sign-up";
const DOCS_HREF = "https://docs.phaseo.ai/v1/quickstart";

export function CTA() {
	return (
		<section className="mb-8 py-8">
			<div className="mx-auto max-w-7xl px-6 lg:px-8">
				<div className="border-t border-zinc-200/80 py-10 dark:border-zinc-800">
					<div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
								Ready to ship
							</p>
							<h2 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl lg:text-5xl">
								Move the product surface and the routing layer onto the same system.
							</h2>

							<p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-700 dark:text-zinc-300">
								Use the open database to choose models, then put live traffic
								through a gateway built for latency, failover, and cleaner cost
								controls.
							</p>
						</div>

						<div className="space-y-5">
							<div className="space-y-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
								<p>Keep the same request shape while changing providers underneath.</p>
								<p>Use the database for selection, then move straight into live routing.</p>
							</div>

							<div className="flex flex-wrap items-center gap-4">
								<Button
									asChild
									size="default"
									className="h-12 gap-3 bg-zinc-900 px-6 text-sm font-semibold text-white hover:bg-zinc-800"
								>
									<Link href={SALES_HREF}>
										Create free account
										<ArrowRight className="h-5 w-5" />
									</Link>
								</Button>
								<Button
									asChild
									size="default"
									variant="outline"
									className="h-12 gap-3 border-zinc-300 bg-transparent px-6 text-sm font-semibold text-zinc-800 transition-transform hover:scale-[1.01] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
								>
									<Link href={DOCS_HREF}>
										<BookOpen className="h-5 w-5" />
										Quickstart
									</Link>
								</Button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

