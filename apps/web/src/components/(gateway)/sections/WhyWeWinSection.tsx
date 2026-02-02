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
					<h2 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
						Why teams choose the AI Stats Gateway
					</h2>
					<p className="text-base text-slate-600 dark:text-slate-400">
						We deliver an open-source routing, telemetry, and
						compliance stack so teams can move faster without
						rebuilding plumbing.
					</p>
					<ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
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
						({ title, description, icon: Icon }) => (
							<Card key={title} className="border-slate-200">
								<CardHeader className="space-y-2">
									<div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
										<Icon className="h-5 w-5" />
									</div>
									<CardTitle className="text-base">
										{title}
									</CardTitle>
									<p className="text-sm text-slate-600 dark:text-slate-400">
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
