// app/roadmap/page.tsx
import { Metadata } from "next";
import {
	GitCompare,
	Users,
	BookOpen,
	BadgeDollarSign,
	BarChart3,
	Infinity as InfinityIcon,
	ArrowRight,
	CheckCircle2,
	Clock,
	Sparkles,
	Bot,
	Megaphone,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
	MILESTONES,
	splitUpcomingAndShipped,
	monthLabelFromKey,
	formatShortDate,
} from "@/lib/roadmap";

export const metadata: Metadata = {
	title: "Roadmap - What We're Building Next For AI Stats",
	description:
		"Follow the AI Stats roadmap to see what we're building next. Track upcoming features and shipped milestones for the AI model database, gateway, and analytics tools.",
	keywords: [
		"AI Stats roadmap",
		"product roadmap",
		"AI gateway roadmap",
		"AI model database",
		"changelog",
		"upcoming features",
	],
	alternates: {
		canonical: "/roadmap",
	},
	openGraph: {
		type: "website",
		title: "AI Stats roadmap - Upcoming Features & Shipped Milestones",
		description:
			"See what's shipping next at AI Stats. Explore upcoming features and recently shipped milestones across the AI model database, gateway, and analytics.",
	},
};

const ICON_MAP = {
	Infinity: <InfinityIcon className="h-5 w-5" />,
	Bot: <Bot className="h-5 w-5" />,
	BarChart3: <BarChart3 className="h-5 w-5" />,
	BadgeDollarSign: <BadgeDollarSign className="h-5 w-5" />,
	BookOpen: <BookOpen className="h-5 w-5" />,
	GitCompare: <GitCompare className="h-5 w-5" />,
	Users: <Users className="h-5 w-5" />,
	Sparkles: <Sparkles className="h-5 w-5" />,
} as const;

type Status = "Planned" | "In Progress" | "Beta" | "Shipped" | "Ongoing";
function StatusBadge({ status }: { status: Status }) {
	const styles: Record<Status, string> = {
		Planned:
			"bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800",
		"In Progress":
			"bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800/60",
		Beta: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800/60",
		Shipped:
			"bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800/60",
		Ongoing:
			"bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800/60",
	};
	const Icon =
		status === "Shipped" ? (
			<CheckCircle2 className="h-3.5 w-3.5" />
		) : status === "In Progress" || status === "Beta" ? (
			<Sparkles className="h-3.5 w-3.5" />
		) : status === "Ongoing" ? (
			<InfinityIcon className="h-3.5 w-3.5" />
		) : (
			<Clock className="h-3.5 w-3.5" />
		);

	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${styles[status]}`}
		>
			{Icon}
			{status}
		</span>
	);
}

function FeedbackCTA() {
	return (
		<Card className="mx-auto mt-5 max-w-3xl rounded-2xl p-5 text-sm text-zinc-700 dark:bg-transparent dark:text-zinc-300">
			<div className="flex items-start gap-3">
				<div className="size-8 shrink-0 grid place-items-center rounded-full border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
					<Megaphone className="size-4" />
				</div>
				<p className="flex-1">
					Got an idea, found an error, or want to prioritise a
					feature? We read everything and ship fast.
				</p>
				<a
					href="/contribute"
					className="whitespace-nowrap rounded-xl bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-100"
				>
					Give feedback
				</a>
			</div>
		</Card>
	);
}

export default async function RoadmapPage() {
	const { upcoming, shippedGroups } = splitUpcomingAndShipped();
	// Avoid reading the current time during prerender.
	const thisMonthKey = new Date(
		process.env.NEXT_PUBLIC_DEPLOY_TIME ?? "1970-01-01T00:00:00.000Z"
	)
		.toISOString()
		.slice(0, 7);

	return (
		<main className="min-h-screen">
			<section className="mx-auto container px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
				<div className="mx-auto max-w-3xl text-center">
					<h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
						AI Stats Roadmap
					</h1>
					<p className="mt-3 text-zinc-600 dark:text-zinc-400">
						A transparent look at what we're building next.
						Timelines are indicative and may shift as we ship faster
						or incorporate feedback.
					</p>
					<FeedbackCTA />

					<div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
						<a
							href="#upcoming"
							className="rounded-full border border-zinc-300 px-3 py-1 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
						>
							Upcoming
						</a>
						<a
							href="#shipped"
							className="rounded-full border border-zinc-300 px-3 py-1 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
						>
							Shipped
						</a>
						<a
							href={`#shipped-${thisMonthKey}`}
							className="rounded-full border border-zinc-300 px-3 py-1 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
						>
							This month
						</a>
					</div>
				</div>

				{/* Upcoming */}
				<h2
					id="upcoming"
					className="mt-10 text-xl font-semibold tracking-tight"
				>
					Upcoming
				</h2>
				<div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
					{upcoming.map((m) => (
						<Card
							key={m.key}
							id={`milestone-${m.key}`}
							className="group relative rounded-2xl p-5 transition hover:shadow-md dark:bg-transparent"
						>
							<div className="flex items-center justify-between">
								<div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
									{ICON_MAP[m.icon]}
								</div>
								<StatusBadge status={m.status as Status} />
							</div>

							<h3 className="mt-4 text-lg font-medium">
								{m.title}
							</h3>

							<div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
								{!m.continuous && m.due && (
									<span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs dark:border-zinc-800 dark:bg-zinc-950">
										<Clock className="h-3.5 w-3.5" />
										<span>Target: {m.due}</span>
									</span>
								)}
								{m.continuous && (
									<span className="inline-flex items-center gap-1 rounded-full border border-violet-300/60 bg-violet-50 px-2 py-0.5 text-xs text-violet-700 dark:border-violet-800/60 dark:bg-violet-900/30 dark:text-violet-300">
										<InfinityIcon className="h-3.5 w-3.5" />
										<span>Continuous</span>
									</span>
								)}
							</div>

							<p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
								{m.description}
							</p>

							{m.href && (
								<a
									href={m.href}
									className="mt-4 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
								>
									Learn more{" "}
									<ArrowRight className="h-4 w-4" />
								</a>
							)}

							<div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-transparent transition group-hover:ring-zinc-300/70 dark:group-hover:ring-zinc-700/70" />
						</Card>
					))}
				</div>

				{/* Shipped */}
				<h2
					id="shipped"
					className="mt-12 text-xl font-semibold tracking-tight"
				>
					Shipped
				</h2>

				{shippedGroups.length === 0 ? (
					<p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
						Nothing shipped yet - check back soon.
					</p>
				) : (
					shippedGroups.map(([monthKey, items]) => (
						<section key={monthKey} className="mt-6">
							<h3
								id={`shipped-${monthKey}`}
								className="text-lg font-medium"
							>
								{monthLabelFromKey(monthKey)}
							</h3>

							<div className="mt-3 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
								{items
									.sort((a, b) =>
										(a as any)._date.getTime() <
										(b as any)._date.getTime()
											? 1
											: -1
									)
									.map((m) => (
										<Card
											key={m.key}
											id={`milestone-${m.key}`}
											className="group relative rounded-2xl p-5 transition hover:shadow-md dark:bg-transparent"
										>
											<div className="flex items-center justify-between">
												<div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
													{ICON_MAP[m.icon]}
												</div>
												<StatusBadge status="Shipped" />
											</div>

											<h4 className="mt-4 text-lg font-medium">
												{m.title}
											</h4>

											<div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
												{m.shippedAt && (
													<span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/60 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300">
														<CheckCircle2 className="h-3.5 w-3.5" />
														<span>
															Shipped:{" "}
															{formatShortDate(
																(m as any)._date
															)}
														</span>
													</span>
												)}
											</div>

											<p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
												{m.description}
											</p>

											{m.href && (
												<a
													href={m.href}
													className="mt-4 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
												>
													View{" "}
													<ArrowRight className="h-4 w-4" />
												</a>
											)}

											<div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-transparent transition group-hover:ring-zinc-300/70 dark:group-hover:ring-zinc-700/70" />
										</Card>
									))}
							</div>
						</section>
					))
				)}
			</section>
		</main>
	);
}
