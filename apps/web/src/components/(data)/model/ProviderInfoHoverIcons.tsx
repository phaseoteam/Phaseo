"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
	Building2,
	CircleHelp,
	Shield,
	ShieldAlert,
	ShieldCheck,
	Tag,
	Workflow,
} from "lucide-react";
import {
	PROVIDER_PROMPT_TRAINING_POLICY_LABELS,
	type ProviderPromptTrainingPolicy,
	normalizeProviderPromptTrainingPolicy,
} from "@/lib/providers/promptTrainingPolicy";

const QUANTIZATION_DOCS_URL =
	"https://docs.ai-stats.phaseo.app/v1/guides/model-quantization";

function uniqueDefined(values: Array<string | null | undefined>): string[] {
	return Array.from(
		new Set(
			values
				.map((value) => (typeof value === "string" ? value.trim() : ""))
				.filter(Boolean)
		)
	).sort((a, b) => a.localeCompare(b));
}

type PromptTrainingEntryInput = {
	policy?: string | null;
	notes?: string | null;
	sourceUrl?: string | null;
	isOverride?: boolean;
};

type PromptTrainingEntry = {
	policy: ProviderPromptTrainingPolicy;
	notes: string | null;
	sourceUrl: string | null;
	isOverride: boolean;
};

type PromptTrainingState = ProviderPromptTrainingPolicy | "mixed";

function normalizePromptTrainingEntries(
	values: PromptTrainingEntryInput[],
): PromptTrainingEntry[] {
	return values.map((value) => ({
		policy: normalizeProviderPromptTrainingPolicy(value.policy),
		notes:
			typeof value.notes === "string" && value.notes.trim()
				? value.notes.trim()
				: null,
		sourceUrl:
			typeof value.sourceUrl === "string" && value.sourceUrl.trim()
				? value.sourceUrl.trim()
				: null,
		isOverride: value.isOverride === true,
	}));
}

function getPromptTrainingState(entries: PromptTrainingEntry[]): PromptTrainingState {
	if (!entries.length) return "unknown";
	const unique = Array.from(new Set(entries.map((entry) => entry.policy)));
	return unique.length === 1 ? unique[0] : "mixed";
}

function getPromptTrainingIcon(state: PromptTrainingState) {
	switch (state) {
		case "no_train":
			return <ShieldCheck className="h-3.5 w-3.5" />;
		case "may_train":
			return <ShieldAlert className="h-3.5 w-3.5" />;
		case "opt_out_available":
			return <Shield className="h-3.5 w-3.5" />;
		case "enterprise_no_train":
			return <Building2 className="h-3.5 w-3.5" />;
		case "mixed":
			return <Workflow className="h-3.5 w-3.5" />;
		default:
			return <CircleHelp className="h-3.5 w-3.5" />;
	}
}

function getPromptTrainingSummary(state: PromptTrainingState): string {
	if (state === "mixed") return "Training policy varies by endpoint/model mapping.";
	return PROVIDER_PROMPT_TRAINING_POLICY_LABELS[state];
}

function IconHover({
	ariaLabel,
	children,
	content,
	triggerClassName,
}: {
	ariaLabel: string;
	children: ReactNode;
	content: ReactNode;
	triggerClassName?: string;
}) {
	return (
		<HoverCard openDelay={150} closeDelay={120}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					aria-label={ariaLabel}
					className={cn(
						"inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:text-foreground hover:border-slate-300 dark:hover:border-slate-700",
						triggerClassName,
					)}
				>
					{children}
				</button>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-72 p-3 text-xs">
				{content}
			</HoverCardContent>
		</HoverCard>
	);
}

function getFirstDefined(values: Array<string | null | undefined>): string | null {
	for (const value of values) {
		if (typeof value !== "string") continue;
		const trimmed = value.trim();
		if (trimmed) return trimmed;
	}
	return null;
}

export default function ProviderInfoHoverIcons({
	providerId,
	providerModelSlugs = [],
	quantizationScheme,
	quantizationSchemes = [],
	promptTraining = [],
	className,
}: {
	providerId: string;
	providerModelSlugs?: Array<string | null | undefined>;
	quantizationScheme?: string | null;
	quantizationSchemes?: Array<string | null | undefined>;
	promptTraining?: PromptTrainingEntryInput[];
	className?: string;
}) {
	const slugs = uniqueDefined(providerModelSlugs);
	const quantization = getFirstDefined([
		quantizationScheme,
		...quantizationSchemes,
	]);
	const promptTrainingEntries = normalizePromptTrainingEntries(promptTraining);
	const promptTrainingState = getPromptTrainingState(promptTrainingEntries);
	const promptTrainingSummary = getPromptTrainingSummary(promptTrainingState);
	const promptTrainingHasOverrides = promptTrainingEntries.some(
		(entry) => entry.isOverride,
	);
	const promptTrainingSourceUrls = uniqueDefined(
		promptTrainingEntries.map((entry) => entry.sourceUrl),
	);
	const promptTrainingNotes = uniqueDefined(
		promptTrainingEntries.map((entry) => entry.notes),
	);
	const promptTrainingPolicyBreakdown = Array.from(
		promptTrainingEntries.reduce((acc, entry) => {
			const current = acc.get(entry.policy) ?? 0;
			acc.set(entry.policy, current + 1);
			return acc;
		}, new Map<ProviderPromptTrainingPolicy, number>()),
	).sort((a, b) =>
		PROVIDER_PROMPT_TRAINING_POLICY_LABELS[a[0]].localeCompare(
			PROVIDER_PROMPT_TRAINING_POLICY_LABELS[b[0]],
		),
	);
	const hasQuantization = Boolean(quantization);
	const hasSlug = slugs.length > 0;
	const hasPromptTraining = promptTrainingEntries.length > 0;

	if (!hasQuantization && !hasSlug && !hasPromptTraining) return null;

	return (
		<div className={cn("flex items-center gap-1.5", className)}>
			{hasPromptTraining ? (
				<IconHover
					ariaLabel="Prompt training policy"
					content={
						<div className="space-y-2">
							<p className="leading-relaxed text-muted-foreground">
								{promptTrainingSummary}
							</p>
							{promptTrainingState === "mixed" ? (
								<div className="space-y-1">
									{promptTrainingPolicyBreakdown.map(([policy, count]) => (
										<div key={policy} className="flex items-center justify-between gap-2">
											<span className="text-foreground">
												{PROVIDER_PROMPT_TRAINING_POLICY_LABELS[policy]}
											</span>
											<span className="text-muted-foreground">
												{count} mapping{count === 1 ? "" : "s"}
											</span>
										</div>
									))}
								</div>
							) : null}
							{promptTrainingHasOverrides ? (
								<p className="text-muted-foreground">
									Includes model-specific override values.
								</p>
							) : null}
							{promptTrainingNotes.length > 0 ? (
								<div className="space-y-1">
									{promptTrainingNotes.slice(0, 2).map((note) => (
										<p key={note} className="text-muted-foreground">
											{note}
										</p>
									))}
								</div>
							) : null}
							{promptTrainingSourceUrls.length > 0 ? (
								<div className="flex flex-col items-start gap-1">
									{promptTrainingSourceUrls.slice(0, 2).map((url) => (
										<Link
											key={url}
											href={url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-primary underline decoration-transparent hover:decoration-current"
										>
											View policy source
										</Link>
									))}
								</div>
							) : null}
						</div>
					}
				>
					{getPromptTrainingIcon(promptTrainingState)}
				</IconHover>
			) : null}

			{hasQuantization ? (
				<IconHover
					ariaLabel="Quantization details"
					triggerClassName="w-auto min-w-7 max-w-[108px] px-2"
					content={
						<div className="space-y-2">
							<p className="leading-relaxed text-muted-foreground">
								This provider serves this model using{" "}
								<code className="rounded bg-muted px-1 py-0.5 text-foreground">
									{quantization}
								</code>{" "}
								quantization.
							</p>
							<Link
								href={QUANTIZATION_DOCS_URL}
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary underline decoration-transparent hover:decoration-current"
							>
								Read quantization docs
							</Link>
						</div>
					}
				>
					<span className="max-w-[90px] truncate text-[10px] font-semibold leading-none tracking-[0.02em] text-foreground">
						{quantization}
					</span>
				</IconHover>
			) : null}

			{hasSlug ? (
				<IconHover
					ariaLabel="Provider label"
					content={
						<div className="space-y-2">
							<p className="leading-relaxed text-muted-foreground">
								This provider labels this model as:
							</p>
							<div className="flex flex-col items-start gap-1">
								{slugs.map((slug) => (
									<code
										key={slug}
										className="inline-flex max-w-full overflow-x-auto whitespace-nowrap rounded bg-muted px-1 py-0.5 text-foreground"
									>
										{slug}
									</code>
								))}
							</div>
							<Link
								href={`/api-providers/${providerId}`}
								className="text-primary underline decoration-transparent hover:decoration-current"
							>
								View provider page
							</Link>
						</div>
					}
				>
					<Tag className="h-3.5 w-3.5" />
				</IconHover>
			) : null}
		</div>
	);
}
