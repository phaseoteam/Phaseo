import Link from "next/link";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import getFamilyModels, {
	type FamilyModelItem,
} from "@/lib/fetchers/models/getFamilyModels";
import getModelOverviewHeader from "@/lib/fetchers/models/getModelOverviewHeader";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getModelOverview } from "@/lib/fetchers/models/getModel";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { CSSProperties } from "react";
import {
	getModelIdFromParams,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";

async function fetchModel(modelId: string, includeHidden: boolean) {
	try {
		return await getModelOverview(modelId, includeHidden);
	} catch (error) {
		console.warn("[seo] failed to load model overview for metadata", {
			modelId,
			error,
		});
		return null;
	}
}

export async function generateMetadata(props: {
	params: Promise<ModelRouteParams>;
}): Promise<Metadata> {
	const params = await props.params;
	const modelId = getModelIdFromParams(params);
	const includeHidden = false;
	const model = await fetchModel(modelId, includeHidden);
	const path = `/models/${modelId}/family`;
	const imagePath = `/og/models/${modelId}`;

	if (!model) {
		return buildMetadata({
			title: "Model Family Overview",
			description:
				"Explore AI model families on AI Stats, including related variants, benchmarks, and pricing information.",
			path,
			keywords: [
				"AI model family",
				"related models",
				"AI benchmarks",
				"AI providers",
				"AI Stats",
			],
			imagePath,
		});
	}

	const organisationName = model.organisation?.name ?? "AI provider";

	const description = [
		`${model.name} family by ${organisationName} on AI Stats.`,
		"Explore related models in this family, including variants, benchmarks, providers, and launch milestones.",
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${model.name} Family - Related Models & Variants`,
		description,
		path,
		keywords: [
			model.name,
			`${model.name} family`,
			`${model.name} related models`,
			`${organisationName} AI`,
			"AI Stats",
			"AI model family",
		],
		imagePath,
	});
}

const monthYearFormatter = new Intl.DateTimeFormat("en", {
	month: "short",
	year: "numeric",
});

const STATUS_STYLES: Record<string, string> = {
	Available:
		"border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
	Announced: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
	Rumoured:
		"border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	Deprecated:
		"border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-300",
	Retired:
		"border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
	default: "border-muted bg-muted/30 text-muted-foreground",
};

function getRelevantDate(member: FamilyModelItem): Date | null {
	const iso = member.release_date ?? member.announcement_date ?? null;
	if (!iso) return null;

	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? null : date;
}

function getDateMeta(member: FamilyModelItem) {
	const date = getRelevantDate(member);
	if (!date) {
		return { display: null, relative: null };
	}

	return {
		display: monthYearFormatter.format(date),
		relative: formatDistanceToNow(date, { addSuffix: true }),
	};
}

function compareByChronology(a: FamilyModelItem, b: FamilyModelItem) {
	const aDate = getRelevantDate(a);
	const bDate = getRelevantDate(b);

	if (aDate && bDate) {
		return aDate.getTime() - bDate.getTime();
	}

	if (aDate) return -1;
	if (bDate) return 1;

	return a.name.localeCompare(b.name);
}

const compareByRecency = (a: FamilyModelItem, b: FamilyModelItem) =>
	-compareByChronology(a, b);

export default async function Page({
	params,
}: {
	params: Promise<ModelRouteParams>;
}) {
	const routeParams = await params;
	const modelId = getModelIdFromParams(routeParams);
	const includeHidden = false;
	const model = await fetchModel(modelId, includeHidden);

	if (!model) {
		return (
			<ModelDetailShell
				modelId={modelId}
				tab="family"
				includeHidden={includeHidden}
			>
				{null}
			</ModelDetailShell>
		);
	}

	let header: Awaited<ReturnType<typeof getModelOverviewHeader>> | null = null;
	try {
		header = await getModelOverviewHeader(modelId, includeHidden);
	} catch (error) {
		console.warn("[family] failed to load model header", { modelId, error });
		return (
			<ModelDetailShell
				modelId={modelId}
				tab="family"
				includeHidden={includeHidden}
			>
				{null}
			</ModelDetailShell>
		);
	}
	if (!header) {
		return (
			<ModelDetailShell
				modelId={modelId}
				tab="family"
				includeHidden={includeHidden}
			>
				{null}
			</ModelDetailShell>
		);
	}
	const familyId = header.family_id ?? null;
	const family = familyId ? await getFamilyModels(familyId, includeHidden) : null;

	const members = family?.models ?? [];
	const hasFamily = Boolean(family && members.length > 0);
	const providerCount = members.length
		? new Set(members.map((m) => m.organisation_id)).size
		: 0;
	const chronologicalMembers = hasFamily
		? [...members].sort(compareByChronology)
		: [];
	const orderedMembers = hasFamily
		? [...members].sort((a, b) => {
				if (a.model_id === modelId) return -1;
				if (b.model_id === modelId) return 1;
				return compareByRecency(a, b);
		  })
		: [];
	const viewingMember = orderedMembers.find(
		(member) => member.model_id === modelId
	);
	const familyName = family?.family_name ?? "Model family";
	const earliestDate =
		chronologicalMembers
			.map((member) => getRelevantDate(member))
			.find((date): date is Date => Boolean(date)) ?? null;
	const latestDate =
		[...chronologicalMembers]
			.reverse()
			.map((member) => getRelevantDate(member))
			.find((date): date is Date => Boolean(date)) ?? null;
	const releaseWindowLabel =
		earliestDate && latestDate
			? `${monthYearFormatter.format(
					earliestDate
			  )} - ${monthYearFormatter.format(latestDate)}`
			: earliestDate
			? monthYearFormatter.format(earliestDate)
			: null;

	return (
		<ModelDetailShell modelId={modelId} tab="family" includeHidden={includeHidden}>
			<div className="mx-auto w-full space-y-6">
				{hasFamily ? (
					<div className="grid gap-6 lg:grid-cols-[320px,minmax(0,1fr)]">
						<Card className="relative overflow-hidden border-primary/20 bg-background">
							<CardHeader className="space-y-3">
								<div className="flex flex-wrap items-center gap-3">
									<CardTitle className="text-2xl font-semibold">
										{familyName} family
									</CardTitle>
									<Badge
										variant="secondary"
										className="rounded-full"
									>
										{members.length} models
									</Badge>
								</div>
								<CardDescription>
									{`We track ${members.length} sibling${
										members.length === 1 ? "" : "s"
									} across ${providerCount} provider${
										providerCount === 1 ? "" : "s"
									}. ${
										releaseWindowLabel
											? `Launch window ${releaseWindowLabel}.`
											: "We are still assembling the historical timeline."
									}`}
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<div
									className="rounded-2xl border bg-background p-4"
									style={{
										borderColor: viewingMember?.organisation
											?.colour
											? viewingMember.organisation.colour
											: undefined,
									}}
								>
									<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Now viewing
									</p>
									<div className="mt-3 flex items-center gap-3">
										<div className="relative h-12 w-12 rounded-xl border bg-background flex items-center justify-center">
											<div className="w-8 h-8 relative">
												{(viewingMember?.organisation_id ||
													header.organisation_id) && (
													<Logo
														id={
															viewingMember?.organisation_id ??
															header.organisation_id
														}
														alt={
															viewingMember
																?.organisation
																?.name ??
															header.organisation
																.name
														}
														fill
														className="object-contain"
													/>
												)}
											</div>
										</div>
										<div className="min-w-0">
											<p className="font-semibold leading-tight">
												{viewingMember?.name ??
													header.name}
											</p>
											<p className="text-sm text-muted-foreground">
												{viewingMember?.organisation
													?.name ??
													header.organisation.name}
											</p>
										</div>
										<Badge
											variant="outline"
											className="ml-auto bg-primary/15 text-primary"
										>
											You are here
										</Badge>
									</div>
								</div>
								<div className="rounded-2xl border bg-muted/40 p-4">
									<p className="text-sm font-semibold">
										Missing a relative?
									</p>
									<p className="text-sm text-muted-foreground">
										Let us know if a new sibling or updated
										release date is missing and we&apos;ll
										add it to the family tree.
									</p>
									<a
										href="https://github.com/AI-Stats/AI-Stats/discussions/new"
										target="_blank"
										rel="noreferrer"
										className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
									>
										Suggest an update
										<ArrowUpRight className="h-3.5 w-3.5" />
									</a>
								</div>
							</CardContent>
						</Card>

						<div className="space-y-6">
							<Card>
								<CardHeader>
									<div className="flex flex-wrap items-center gap-3">
										<div>
											<CardTitle>
												Family members
											</CardTitle>
											<CardDescription>
												Dive into each sibling for
												pricing, benchmarks, and
												availability.
											</CardDescription>
										</div>
									</div>
								</CardHeader>
								<CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
									{orderedMembers.map((member) => {
										const isCurrent =
											member.model_id === modelId;
										const statusKey =
											member.status ?? "default";
										const statusClass =
											STATUS_STYLES[statusKey] ??
											STATUS_STYLES.default;
										const accentColor =
											member.organisation?.colour;
										const dateMeta = getDateMeta(member);

										return (
											<div
												key={member.model_id}
												className={cn(
													"rounded-2xl border bg-background p-4 transition hover:border-primary/60",
													isCurrent &&
														"bg-background shadow-lg shadow-primary/20"
												)}
												style={
													accentColor
														? ({
																borderColor:
																	accentColor,
														  } as CSSProperties)
														: undefined
												}
											>
												<div className="flex flex-wrap items-center gap-4">
													<div className="flex items-center gap-3 min-w-0">
														<div className="relative h-12 w-12 rounded-xl border bg-background flex items-center justify-center">
															<div className="w-8 h-8 relative">
																{member.organisation_id ? (
																	<Logo
																		id={
																			member.organisation_id
																		}
																		alt={
																			member
																				.organisation
																				?.name ??
																			member.name
																		}
																		fill
																		className="object-contain"
																	/>
																) : (
																	<span className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase text-muted-foreground">
																		{member.name
																			.slice(
																				0,
																				2
																			)
																			.toUpperCase()}
																	</span>
																)}
															</div>
														</div>
														<div className="min-w-0">
															<Link
																href={`/models/${member.model_id}`}
																className="font-semibold leading-tight block"
															>
																<span className="relative after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
																	{
																		member.name
																	}
																</span>
															</Link>
															{member.organisation_id ? (
																<Link
																	href={`/organisations/${member.organisation_id}`}
																	className="text-sm text-muted-foreground hover:text-foreground"
																>
																	<span className="relative after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
																		{member
																			.organisation
																			?.name ??
																			"Provider"}
																	</span>
																</Link>
															) : (
																<p className="text-sm text-muted-foreground">
																	Independent
																	release
																</p>
															)}
														</div>
													</div>
													<div className="ml-auto flex flex-wrap items-center gap-2">
														<Badge
															variant="outline"
															className={cn(
																statusClass
															)}
														>
															{member.status ??
																"Status pending"}
														</Badge>
														{isCurrent && (
															<Badge variant="secondary">
																Viewing now
															</Badge>
														)}
													</div>
												</div>
												<div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
													<div>
														<p className="text-xs uppercase tracking-wide text-muted-foreground">
															Release window
														</p>
														<p className="font-medium text-foreground">
															{dateMeta.display ??
																"Date TBC"}
														</p>
													</div>
													<div>
														<p className="text-xs uppercase tracking-wide text-muted-foreground">
															Timeline
														</p>
														<p className="font-medium text-foreground">
															{dateMeta.relative ??
																"Awaiting confirmation"}
														</p>
													</div>
												</div>
											</div>
										);
									})}
								</CardContent>
							</Card>
						</div>
					</div>
				) : (
					<Card className="border-dashed">
						<CardHeader>
							<CardTitle>No family information yet</CardTitle>
							<CardDescription>
								We haven&apos;t linked this model to a wider
								family. Check back soon as we expand our
								coverage.
							</CardDescription>
						</CardHeader>
					</Card>
				)}
			</div>
		</ModelDetailShell>
	);
}
