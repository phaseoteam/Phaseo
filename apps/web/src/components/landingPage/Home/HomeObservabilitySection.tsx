import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const OBSERVABILITY_ITEMS = [
	{
		title: "Trace issues",
		body: "See which model, provider, key, and app produced a failure or slowdown.",
	},
	{
		title: "Review routing",
		body: "Understand how the gateway rerouted traffic when provider health changed.",
	},
	{
		title: "Spot regressions early",
		body: "Compare model and provider changes before they become user-facing incidents.",
	},
] as const;

export default function HomeObservabilitySection() {
	return (
		<section className="w-full border-b border-zinc-200/80 pb-16 dark:border-zinc-800/80">
			<div className="space-y-8">
				<div className="mx-auto max-w-3xl space-y-3 text-center">
					<h2 className="text-3xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50 sm:text-4xl">
						Visibility when you need it.
					</h2>
					<p className="mx-auto max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300 md:text-lg">
						Most provider instability should be absorbed by routing and failover. When something
						still needs attention, the gateway gives teams one place to inspect what changed.
					</p>
					<div className="flex justify-center">
						<Button asChild variant="outline" className="h-11 rounded-xl px-6 text-sm font-semibold">
							<Link href="/settings/usage">
								View gateway dashboard
								<ArrowRight className="h-4 w-4" />
							</Link>
						</Button>
					</div>
				</div>
				<div className="grid gap-6 sm:grid-cols-3">
					{OBSERVABILITY_ITEMS.map((item) => (
						<div key={item.title} className="space-y-2 border-t border-zinc-200/80 pt-4 dark:border-zinc-800/80">
							<h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
								{item.title}
							</h3>
							<p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
								{item.body}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

