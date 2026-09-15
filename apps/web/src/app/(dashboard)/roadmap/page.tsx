import Link from "next/link";
import type { Metadata } from "next";
import {
	Activity,
	ArrowRight,
	ArrowUpRight,
	BarChart3,
	BadgeDollarSign,
	BookOpen,
	Bot,
	Gauge,
	GitCompare,
	Infinity as InfinityIcon,
	KeyRound,
	Layers3,
	LockKeyhole,
	RefreshCw,
	Route,
	ShieldCheck,
	Sparkles,
	Users,
	Webhook,
	type LucideIcon,
} from "lucide-react";
import {
	formatShortDate,
	monthLabelFromKey,
	splitUpcomingAndShipped,
	type IconName,
	type RoadmapMilestone,
	type RoadmapStatus,
} from "@/lib/roadmap";

export const metadata: Metadata = {
	title: "Roadmap",
	description:
		"See what Phaseo has shipped, what is improving continuously, and how the open gateway is moving forward.",
	keywords: [
		"Phaseo roadmap",
		"product roadmap",
		"AI gateway roadmap",
		"AI model database",
		"shipped features",
	],
	alternates: {
		canonical: "/roadmap",
	},
	openGraph: {
		type: "website",
		title: "Phaseo roadmap - Shipped work and ongoing progress",
		description:
			"Track what Phaseo has shipped, what is improving continuously, and how the open gateway is moving forward.",
	},
};

const ICON_MAP: Record<IconName, LucideIcon> = {
	Activity,
	BarChart3,
	BadgeDollarSign,
	BookOpen,
	Bot,
	Gauge,
	GitCompare,
	Infinity: InfinityIcon,
	KeyRound,
	Layers3,
	LockKeyhole,
	RefreshCw,
	Route,
	ShieldCheck,
	Sparkles,
	Users,
	Webhook,
};

function StatusMark({ status }: { status: RoadmapStatus }) {
	const isShipped = status === "Shipped";
	const label = status === "Ongoing" ? "Ongoing" : status;

	return (
		<span
			className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${
				isShipped ? "text-primary" : "text-muted-foreground"
			}`}
		>
			<span
				aria-hidden="true"
				className={`size-1.5 rounded-full ${isShipped ? "bg-primary" : "bg-muted-foreground/50"}`}
			/>
			{label}
		</span>
	);
}

function MilestoneRow({
	milestone,
	dateLabel,
}: {
	milestone: RoadmapMilestone;
	dateLabel: string;
}) {
	const Icon = ICON_MAP[milestone.icon];

	return (
		<article
			id={`milestone-${milestone.key}`}
			className="grid gap-5 py-6 sm:grid-cols-[11rem_minmax(0,1fr)] lg:grid-cols-[12rem_minmax(0,1fr)_auto] lg:items-start"
		>
			<div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
				<Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
				<span>{dateLabel}</span>
			</div>

			<div className="max-w-3xl space-y-2">
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					<h3 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
						{milestone.title}
					</h3>
					<StatusMark status={milestone.status} />
				</div>
				<p className="text-sm leading-7 text-muted-foreground">
					{milestone.description}
				</p>
			</div>

			{milestone.href ? (
				<Link
					href={milestone.href}
					className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline decoration-zinc-300 underline-offset-4 hover:decoration-foreground dark:decoration-zinc-700 dark:hover:decoration-foreground sm:col-start-2 lg:col-start-auto lg:self-center"
				>
					View in Phaseo
					<ArrowUpRight className="size-4" aria-hidden="true" />
				</Link>
			) : null}
		</article>
	);
}

export default function RoadmapPage() {
	const { upcoming, shippedGroups } = splitUpcomingAndShipped();
	const shippedCount = shippedGroups.reduce((total, [, items]) => total + items.length, 0);
	const latestShippedDate = shippedGroups[0]?.[1][0]?._date;

	return (
		<main className="min-h-screen">
			<div className="mx-4 px-2 py-12 sm:mx-6 sm:px-0 sm:py-16 lg:mx-8 xl:mx-10 2xl:mx-auto 2xl:max-w-[1460px]">
				<section className="max-w-4xl space-y-7">
					<h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
						Most of the foundation is now shipped.
					</h1>
					<p className="max-w-3xl text-base leading-7 text-muted-foreground">
						The old roadmap left too much work in the future. This is the current picture: what is live, what is improving continuously, and how the next layer of the gateway will be shaped.
					</p>
					<div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
						<Link
							href="/updates"
							className="inline-flex items-center text-sm font-medium text-foreground underline decoration-zinc-300 underline-offset-4 hover:decoration-foreground dark:decoration-zinc-700 dark:hover:decoration-foreground"
						>
							Read the latest updates
							<ArrowRight className="ml-2 size-4" aria-hidden="true" />
						</Link>
						<Link
							href="/contribute"
							className="inline-flex items-center text-sm font-medium text-foreground underline decoration-zinc-300 underline-offset-4 hover:decoration-foreground dark:decoration-zinc-700 dark:hover:decoration-foreground"
						>
							Suggest a change
							<ArrowRight className="ml-2 size-4" aria-hidden="true" />
						</Link>
					</div>
				</section>

				<div className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-y border-border/70 py-4 text-sm text-muted-foreground">
					<span>
						<strong className="font-semibold text-foreground">{shippedCount}</strong> shipped milestones
					</span>
					<span>
						<strong className="font-semibold text-foreground">{upcoming.length}</strong> ongoing workstreams
					</span>
					{latestShippedDate ? (
						<span>
							Latest release: {formatShortDate(latestShippedDate)}
						</span>
					) : null}
				</div>

				<section id="current" className="scroll-mt-24 pt-16">
					<div className="max-w-3xl space-y-2">
						<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
							What is moving now.
						</h2>
						<p className="text-sm leading-7 text-muted-foreground">
							Coverage and catalog quality are deliberately ongoing. They change with the provider ecosystem, so we track them as continuous work rather than attach an artificial finish date.
						</p>
					</div>
					<div className="mt-6 divide-y divide-border/70 border-y border-border/70">
						{upcoming.map((milestone) => (
							<MilestoneRow
								key={milestone.key}
								milestone={milestone}
								dateLabel={milestone.continuous ? "Continuous" : "Next"}
							/>
						))}
					</div>
				</section>

				<section id="shipped" className="scroll-mt-24 pt-16">
					<div className="max-w-3xl space-y-2">
						<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
							What has shipped.
						</h2>
						<p className="text-sm leading-7 text-muted-foreground">
							The release record is grouped by month, with the newest work first. Links take you to the relevant product surface where one exists.
						</p>
					</div>

					<div className="mt-8 space-y-10">
						{shippedGroups.map(([monthKey, items]) => (
							<section key={monthKey} className="scroll-mt-24">
								<h3
									id={`shipped-${monthKey}`}
									className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground"
								>
									{monthLabelFromKey(monthKey)}
								</h3>
								<div className="mt-3 divide-y divide-border/70 border-y border-border/70">
									{items.map((milestone) => (
										<MilestoneRow
											key={milestone.key}
											milestone={milestone}
											dateLabel={formatShortDate(milestone._date)}
										/>
									))}
								</div>
							</section>
						))}
					</div>
				</section>

				<section className="mt-16 border-t border-border/70 pt-10">
					<div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
						<div className="max-w-3xl space-y-2">
							<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
								Help shape what ships next.
							</h2>
							<p className="text-sm leading-7 text-muted-foreground">
								Phaseo is built in public. If something is missing, unclear, or more important than the work shown here, tell us what would make the gateway more useful.
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-3 lg:justify-end">
							<Link
								href="/contribute"
								className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
							>
								Suggest a change
								<ArrowRight className="size-4" aria-hidden="true" />
							</Link>
							<Link
								href="/updates"
								className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline decoration-zinc-300 underline-offset-4 hover:decoration-foreground dark:decoration-zinc-700 dark:hover:decoration-foreground"
							>
								Read updates
								<ArrowUpRight className="size-4" aria-hidden="true" />
							</Link>
						</div>
					</div>
				</section>
			</div>
		</main>
	);
}
