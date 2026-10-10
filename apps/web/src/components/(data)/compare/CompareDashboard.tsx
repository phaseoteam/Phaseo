"use client";

import { useMemo, type ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import MainCard from "./MainCard";
import ComparisonDisplay from "./ComparisonDisplay";
import { ExtendedModel } from "@/data/types";
import ModelCombobox from "./ModelCombobox";
import type { CompareGatewayUsageByModel, CompareModelOption } from "./types";
import { useTranslations } from "next-intl";

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

type CompareDashboardProps = {
	models: CompareModelOption[];
	comparisonData: ExtendedModel[];
	usageByModel: CompareGatewayUsageByModel;
};

function CompareFrame({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="w-full">
			<div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
				{children}
			</div>
		</div>
	);
}

function EmptyComparisonState({
	models,
	onSelect,
}: {
	models: CompareModelOption[];
	onSelect: (ids: string[]) => void;
}) {
	const t = useTranslations("Catalogue.compare");
	return (
		<CompareFrame>
			<div className="max-w-2xl">
				<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
					{t("emptyTitle")}
				</h1>
				<p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
					{t("emptyDescription")}
				</p>
			</div>

			<div className="mt-8 grid gap-3 sm:grid-cols-2">
				{["first", "second"].map((slot) => (
					<ModelCombobox
						key={slot}
						models={models}
						selected={[]}
						setSelected={onSelect}
						labelWhenEmpty={t("selectModel")}
						labelWhenSelected={t("selectModel")}
						showSelectionCount={false}
						className="h-14 w-full justify-center rounded-xl border border-dashed border-border/80 text-sm text-muted-foreground hover:border-sky-500/50 hover:bg-card hover:text-foreground"
					/>
				))}
			</div>
		</CompareFrame>
	);
}

export default function CompareDashboard({
	models,
	comparisonData,
	usageByModel,
}: CompareDashboardProps) {
	const t = useTranslations("Catalogue.compare");
	const searchParams = useSearchParams() ?? new URLSearchParams();
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
	const uniqueResolvedSelectionIds = useMemo(() => {
		const uniqueIds: string[] = [];
		const seen = new Set<string>();
		for (const id of resolvedSelectionIds) {
			if (!id || seen.has(id)) continue;
			seen.add(id);
			uniqueIds.push(id);
		}
		return uniqueIds;
	}, [resolvedSelectionIds]);

	const modelsById = useMemo(() => {
		const map = new Map<string, CompareModelOption>();
		for (const model of models) {
			if (!model.id) continue;
			map.set(model.id, model);
		}
		return map;
	}, [models]);

	const setSelected = (ids: string[]) => {
		const params = new URLSearchParams(searchParams.toString());
		params.delete("models");
		ids.forEach((id) => params.append("models", encodeModelIdForUrl(id)));
		router.replace(`?${params.toString()}`);
	};

	const selectedModels = uniqueResolvedSelectionIds
		.map((modelId) => modelsById.get(modelId))
		.filter((model): model is CompareModelOption => Boolean(model));
	const comparisonDataById = useMemo(() => {
		const map = new Map<string, ExtendedModel>();
		for (const model of comparisonData) {
			if (!model.id) continue;
			map.set(model.id, model);
		}
		return map;
	}, [comparisonData]);
	const orderedComparisonData = useMemo(() => {
		if (!uniqueResolvedSelectionIds.length) return comparisonData;
		const ordered = uniqueResolvedSelectionIds
			.map((modelId) => comparisonDataById.get(modelId))
			.filter((model): model is ExtendedModel => Boolean(model));
		const orderedIds = new Set(ordered.map((model) => model.id));
		const fallbackRemainder = comparisonData.filter(
			(model) => !orderedIds.has(model.id)
		);
		return [...ordered, ...fallbackRemainder];
	}, [comparisonData, comparisonDataById, uniqueResolvedSelectionIds]);

	const notFound = uniqueResolvedSelectionIds.filter(
		(id) => !selectedModels.some((m) => m.id === id)
	);

	if (selected.length === 0) {
		return (
			<EmptyComparisonState models={models} onSelect={setSelected} />
		);
	}

	if (selected.length > 0 && selectedModels.length === 0) {
		return (
			<CompareFrame>
				<div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
				<div className="max-w-2xl w-full bg-yellow-50 border border-yellow-200 rounded-lg p-6">
					<h2 className="text-xl font-semibold text-yellow-900 mb-2">
						{t("notFoundTitle")}
					</h2>
					<p className="text-yellow-800 mb-4">
					{t("notFoundBody")}
					</p>
					<ul className="list-disc list-inside text-yellow-700 mb-4">
						{notFound.map((id) => (
							<li key={id} className="font-mono text-sm">
								{id}
							</li>
						))}
					</ul>
					<p className="text-sm text-yellow-700">
						{t("notFoundSearch")}
					</p>
				</div>
				<Separator className="my-8 w-full max-w-4xl" />
				<MainCard
					models={models}
					selected={[]}
					setSelected={setSelected}
				/>
				</div>
			</CompareFrame>
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
			resolvedIds: uniqueResolvedSelectionIds,
		});
		return (
			<CompareFrame>
				<div className="flex flex-col items-center justify-center min-h-[40vh] text-center text-muted-foreground space-y-2">
				<p>{t("loadFailure")}</p>
				<button
					type="button"
					className="text-sm font-medium underline underline-offset-4"
					onClick={() => setSelected(uniqueResolvedSelectionIds)}
				>
					{t("refreshSelection")}
				</button>
				</div>
			</CompareFrame>
		);
	}

	return (
		<CompareFrame>
			<ComparisonDisplay
				selectedModels={orderedComparisonData}
				usageByModel={usageByModel}
				models={models}
				selectedIds={uniqueResolvedSelectionIds}
				onSelectedIdsChange={setSelected}
			/>
		</CompareFrame>
	);
}
