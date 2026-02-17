"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import MainCard from "./MainCard";
import ComparisonDisplay from "./ComparisonDisplay";
import { ExtendedModel } from "@/data/types";
import ModelCombobox from "./ModelCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { ProviderLogo } from "./ProviderLogo";

type QuickComparison = {
	title: string;
	modelIds: string[];
	logos: string[];
};

const decodeModelIdFromUrl = (value: string): string => {
	const trimmed = value?.trim();
	if (!trimmed) return "";
	if (trimmed.includes("/")) return trimmed;
	if (!trimmed.includes("_")) return trimmed;
	const [organisationId, ...rest] = trimmed.split("_");
	if (!organisationId || rest.length === 0) return trimmed;
	return `${organisationId}/${rest.join("_")}`;
};

const encodeModelIdForUrl = (value: string): string => {
	if (!value) return "";
	const [organisationId, ...rest] = value.split("/");
	if (!organisationId || rest.length === 0) return value;
	return `${organisationId}_${rest.join("/")}`;
};

function toReleaseTs(value: string | null | undefined): number {
	if (!value) return 0;
	const ts = new Date(value).getTime();
	return Number.isFinite(ts) ? ts : 0;
}

function pickLatestAcrossProviders(models: ExtendedModel[], count: number): ExtendedModel[] {
	const sorted = [...models].sort(
		(a, b) => toReleaseTs(b.release_date) - toReleaseTs(a.release_date)
	);
	const picked: ExtendedModel[] = [];
	const seenProviders = new Set<string>();
	for (const model of sorted) {
		const providerId = model.provider?.provider_id ?? "";
		if (!providerId) continue;
		if (seenProviders.has(providerId)) continue;
		picked.push(model);
		seenProviders.add(providerId);
		if (picked.length >= count) break;
	}
	return picked;
}

function pickLatestFromProvider(models: ExtendedModel[], providerId: string): ExtendedModel | null {
	const candidates = models.filter((m) => m.provider?.provider_id === providerId);
	if (!candidates.length) return null;
	return candidates.reduce((best, next) =>
		toReleaseTs(next.release_date) > toReleaseTs(best.release_date) ? next : best
	);
}

function buildQuickComparisons(models: ExtendedModel[]): QuickComparison[] {
	if (!models.length) return [];

	const byRelease = [...models].sort(
		(a, b) => toReleaseTs(b.release_date) - toReleaseTs(a.release_date)
	);
	const topTwo = byRelease.slice(0, 2);
	const crossProvider = pickLatestAcrossProviders(models, 4);

	const bigProviders = ["openai", "anthropic", "google", "x-ai"];
	const bigFour = bigProviders
		.map((providerId) => pickLatestFromProvider(models, providerId))
		.filter(Boolean) as ExtendedModel[];

	const out: QuickComparison[] = [];

	if (crossProvider.length >= 2) {
		out.push({
			title: "Latest releases (cross-provider)",
			modelIds: crossProvider.map((m) => m.id),
			logos: crossProvider.map((m) => m.provider.provider_id),
		});
	}

	if (topTwo.length === 2) {
		out.push({
			title: "Newest head-to-head",
			modelIds: topTwo.map((m) => m.id),
			logos: topTwo.map((m) => m.provider.provider_id),
		});
	}

	if (bigFour.length >= 2) {
		out.push({
			title:
				bigFour.length >= 4
					? "Snapshot: major providers"
					: "Snapshot: provider leaders",
			modelIds: bigFour.slice(0, 4).map((m) => m.id),
			logos: bigFour.slice(0, 4).map((m) => m.provider.provider_id),
		});
	}

	if (out.length >= 3) return out.slice(0, 3);

	// Fallback: just pick distinct providers in alphabetical order.
	const alpha = [...models].sort((a, b) => a.name.localeCompare(b.name));
	const fallback = pickLatestAcrossProviders(alpha, 4);
	if (fallback.length >= 2) {
		out.push({
			title: "Starter pack",
			modelIds: fallback.map((m) => m.id),
			logos: fallback.map((m) => m.provider.provider_id),
		});
	}

	return out.slice(0, 3);
}

const buildQuickComparisonHref = (modelIds: string[]): string => {
	const params = new URLSearchParams();
	modelIds.forEach((id) => {
		if (id) params.append("models", encodeModelIdForUrl(id));
	});
	const queryString = params.toString();
	return queryString ? `/compare?${queryString}` : "/compare";
};

type CompareDashboardProps = {
	models: ExtendedModel[];
	comparisonData: ExtendedModel[];
};

export default function CompareDashboard({
	models,
	comparisonData,
}: CompareDashboardProps) {
	const searchParams = useSearchParams();
	const router = useRouter();
	const selected = searchParams
		.getAll("models")
		.map((value) => decodeModelIdFromUrl(value))
		.filter(Boolean);

	const selectionLookup = useMemo(() => {
		const map = new Map<string, string>();
		models.forEach((model) => {
			if (!model.id) return;
			map.set(model.id, model.id);
		});
		return map;
	}, [models]);

	const resolvedSelectionIds = useMemo(
		() => selected.map((value) => selectionLookup.get(value) ?? value),
		[selected, selectionLookup]
	);

	const resolvedSelectionSet = useMemo(
		() => new Set(resolvedSelectionIds),
		[resolvedSelectionIds]
	);

	const setSelected = (ids: string[]) => {
		const params = new URLSearchParams(searchParams.toString());
		params.delete("models");
		ids.forEach((id) => params.append("models", encodeModelIdForUrl(id)));
		router.replace(`?${params.toString()}`);
	};

	const selectedModels = models.filter((m) => resolvedSelectionSet.has(m.id));

	const notFound = resolvedSelectionIds.filter(
		(id) => !selectedModels.some((m) => m.id === id)
	);

	if (selected.length === 0) {
		const previewComparisons = buildQuickComparisons(models);

		return (
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
				<div className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="secondary" className="text-[11px]">
							Compare
						</Badge>
						<Badge variant="outline" className="text-[11px]">
							Up to 4 models
						</Badge>
						<Badge variant="outline" className="text-[11px]">
							Benchmarks
						</Badge>
						<Badge variant="outline" className="text-[11px]">
							Pricing
						</Badge>
					</div>
					<h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
						Compare models side-by-side
					</h2>
					<p className="max-w-3xl text-sm leading-6 text-muted-foreground">
						Build a shareable comparison across benchmarks, pricing, context,
						availability, and release timelines.
					</p>
				</div>

				<div className="grid gap-6 lg:grid-cols-2 items-start">
					<section className="rounded-2xl border border-border/60 bg-card text-card-foreground p-6 shadow-sm flex flex-col gap-5">
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground">
								Option 1
							</p>
							<h3 className="text-xl font-semibold">Quick comparisons</h3>
							<p className="text-muted-foreground text-sm">
								Auto-generated from the latest model metadata.
							</p>
						</div>
						<div className="space-y-3">
							{previewComparisons.length ? (
								previewComparisons.map((comparison) => (
									<Link
										key={comparison.title}
										href={buildQuickComparisonHref(comparison.modelIds)}
										className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/50 p-4 transition hover:border-primary"
									>
										<div className="flex flex-wrap items-center gap-2">
											{comparison.logos.map((logoId) => (
												<ProviderLogo
													key={`${comparison.title}-${logoId}`}
													id={logoId}
													alt={`${logoId} logo`}
													size="sm"
												/>
											))}
										</div>
										<span className="text-sm font-medium leading-tight">
											{comparison.title}
										</span>
										<span className="text-xs text-muted-foreground">
											Click to load this matchup
										</span>
									</Link>
								))
							) : (
								<div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
									No quick comparisons available yet.
								</div>
							)}
						</div>
						<Button asChild variant="ghost" className="justify-between">
							<Link href="/models">
								Browse models
								<ArrowRight className="h-4 w-4" />
							</Link>
						</Button>
					</section>

					<section className="rounded-2xl border border-border/60 bg-card text-card-foreground p-6 shadow-sm flex flex-col gap-4">
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground">
								Option 2
							</p>
							<h3 className="text-xl font-semibold">Pick your own</h3>
							<p className="text-sm text-muted-foreground">
								Search any models (up to four) and build a bespoke comparison.
							</p>
						</div>
						<div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4">
							<ModelCombobox
								models={models}
								selected={selected}
								setSelected={setSelected}
							/>
						</div>
						<p className="text-xs text-muted-foreground">
							This is the same picker as the sticky header, just placed here as
							a starting point.
						</p>
					</section>
				</div>
			</div>
		);
	}

	if (selected.length > 0 && selectedModels.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
				<div className="max-w-2xl w-full bg-yellow-50 border border-yellow-200 rounded-lg p-6">
					<h2 className="text-xl font-semibold text-yellow-900 mb-2">
						Models Not Found
					</h2>
					<p className="text-yellow-800 mb-4">
						The following model IDs from the URL could not be found
						in the database:
					</p>
					<ul className="list-disc list-inside text-yellow-700 mb-4">
						{notFound.map((id) => (
							<li key={id} className="font-mono text-sm">
								{id}
							</li>
						))}
					</ul>
					<p className="text-sm text-yellow-700">
						Please use the search below to find valid model IDs.
					</p>
				</div>
				<Separator className="my-8 w-full max-w-4xl" />
				<MainCard
					models={models}
					selected={[]}
					setSelected={setSelected}
				/>
			</div>
		);
	}

	if (notFound.length > 0 && selectedModels.length > 0) {
		console.warn(
			`[CompareDashboard] ${selectedModels.length} models found, but ${notFound.length} not found:`,
			notFound
		);
	}

	if (selected.length > 0 && comparisonData.length === 0) {
		console.warn("[compare] No comparison data resolved", {
			selection: selected,
			resolvedIds: resolvedSelectionIds,
		});
		return (
			<div className="flex flex-col items-center justify-center min-h-[40vh] text-center text-muted-foreground space-y-2">
				<p>We couldn&apos;t load the comparison data for this query.</p>
				<button
					type="button"
					className="text-sm font-medium underline underline-offset-4"
					onClick={() => setSelected(resolvedSelectionIds)}
				>
					Refresh selection
				</button>
			</div>
		);
	}

	return <ComparisonDisplay selectedModels={comparisonData} />;
}
