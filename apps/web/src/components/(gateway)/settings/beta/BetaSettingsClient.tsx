"use client";

import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";

type BetaFeatureDefinition = {
	key: string;
	kind?: "toggle" | "range";
	stage?: "internal" | "beta" | "ga";
	title: string;
	description: string;
	details?: readonly string[];
	blogPost?: {
		href: string;
		label?: string;
	};
};

type FeatureStage = NonNullable<BetaFeatureDefinition["stage"]>;

const FEATURE_STAGE_STYLES = {
	ga: {
		label: "GA",
		title: "Generally available.",
		badgeClassName:
			"border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200",
	},
	beta: {
		label: "Beta",
		title: "Available to admins and accounts included in the current beta rollout.",
		badgeClassName:
			"border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200",
	},
	internal: {
		label: "Internal",
		title: "Visible to internal and admin users before beta rollout.",
		badgeClassName:
			"border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
	},
} satisfies Record<
	FeatureStage,
	{
		label: string;
		title: string;
		badgeClassName: string;
	}
>;

export default function BetaSettingsClient({
	features,
}: {
	features: readonly BetaFeatureDefinition[];
}) {
	return (
		<section className="space-y-3">
			{features.map((feature) => (
				<FeatureRow key={feature.key} feature={feature} />
			))}
		</section>
	);
}

function FeatureStageBadge({ stage }: { stage: FeatureStage }) {
	const stageStyle = FEATURE_STAGE_STYLES[stage];

	return (
		<Badge
			variant="outline"
			title={stageStyle.title}
			className={`h-5 px-2 text-[10px] font-medium ${stageStyle.badgeClassName}`}
		>
			{stageStyle.label}
		</Badge>
	);
}

function FeatureRow({ feature }: { feature: BetaFeatureDefinition }) {
	const stage = feature.stage ?? "internal";

	return (
		<div className="rounded-2xl border border-border/70 bg-background shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-colors hover:border-border">
			<div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-5">
				<div className="min-w-0 space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="text-sm font-semibold tracking-tight text-foreground">
							{feature.title}
						</h3>
						<FeatureStageBadge stage={stage} />
						{feature.kind && feature.kind !== "toggle" ? (
							<Badge variant="outline" className="h-5 px-2 text-[10px]">
								{feature.kind}
							</Badge>
						) : null}
					</div>
					<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
						{feature.description}
					</p>
					{feature.details?.length ? (
						<Collapsible>
							<CollapsibleTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
								>
									Release notes
									<ChevronDown className="size-3" aria-hidden="true" />
								</Button>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<ul className="mt-2 grid gap-1.5 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
									{feature.details.map((detail) => (
										<li key={detail} className="rounded-lg bg-muted/30 px-3 py-2">
											{detail}
										</li>
									))}
								</ul>
							</CollapsibleContent>
						</Collapsible>
					) : null}
				</div>
				{feature.blogPost ? (
					<Button
						asChild
						size="sm"
						variant="outline"
						className="w-full transition-transform active:translate-y-px sm:w-auto"
					>
						<Link href={feature.blogPost.href}>
							{feature.blogPost.label ?? "Read announcement"}
							<ArrowRight className="size-3.5" aria-hidden="true" />
						</Link>
					</Button>
				) : (
					<div className="text-sm text-muted-foreground sm:text-right">
						Blog post coming soon
					</div>
				)}
			</div>
		</div>
	);
}
