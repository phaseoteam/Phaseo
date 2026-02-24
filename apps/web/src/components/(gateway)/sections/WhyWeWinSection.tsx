import { BarChart3, Gauge, GitCommit, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CheckItem from "../page/CheckItem";

const DIFFERENTIATORS = [
	{
		title: "Open Source & Trustworthy",
		description:
			"Full transparency through open source code builds trust - audit our security, compliance, and routing logic yourself.",
		icon: ShieldCheck,
	},
	{
		title: "Latency-aware routing",
		description:
			"EWMA and percentile health signals shift traffic before incidents degrade your SLAs.",
		icon: Gauge,
	},
	{
		title: "Observability first",
		description:
			"Request-level cost, tokens, latency, success codes, and traces are captured automatically.",
		icon: BarChart3,
	},
	{
		title: "Community-driven development",
		description:
			"Active community contributions and transparent roadmap accelerate the development of new adapters, features and open access to AI.",
		icon: GitCommit,
	},
];

export function WhyWeWinSection() {
	return (
		<section
			id="why-we-win"
			className="mx-auto max-w-7xl px-6 py-16 lg:px-8"
		>
			<div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<div className="space-y-6">
					<h2 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
						Why teams choose the AI Stats Gateway
					</h2>
					<p className="text-base text-zinc-600 dark:text-zinc-300">
						We deliver an open-source routing, telemetry, and
						compliance stack so teams can move faster without
						rebuilding plumbing.
					</p>
					<ul className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
						<CheckItem>
							Health data gates and failover logic flip settings
							across providers in seconds.
						</CheckItem>
						<CheckItem>
							Community contributions ship adapters quicker, with
							every change public and open for review.
						</CheckItem>
						<CheckItem>
							Open source transparency enables self-auditing of
							security, compliance, and routing logic.
						</CheckItem>
					</ul>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					{DIFFERENTIATORS.map(
						({ title, description, icon: Icon }, index) => (
							<Card
								key={title}
								className={
									index === 0
										? "border-zinc-900 bg-zinc-900 text-zinc-100 dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-900"
										: "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/70"
								}
							>
								<CardHeader className="space-y-2">
									<div
										className={
											index === 0
												? "inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-zinc-100 dark:bg-zinc-900 dark:text-zinc-100"
												: "inline-flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
										}
									>
										<Icon className="h-5 w-5" />
									</div>
									<CardTitle className="text-base">
										{title}
									</CardTitle>
									<p
										className={
											index === 0
												? "text-sm text-zinc-200 dark:text-zinc-700"
												: "text-sm text-zinc-600 dark:text-zinc-300"
										}
									>
										{description}
									</p>
								</CardHeader>
							</Card>
						)
					)}
				</div>
			</div>
		</section>
	);
}
