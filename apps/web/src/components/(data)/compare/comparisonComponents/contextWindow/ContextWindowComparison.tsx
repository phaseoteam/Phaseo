"use client";

import { ExtendedModel } from "@/data/types";
import {
	Card,
	CardHeader,
	CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ContextWindowBarChart from "./ContextWindowBarChart";
import React from "react";
import { Info } from "lucide-react";
import Link from "next/link";
import { ProviderLogoName } from "../../ProviderLogoName";
import { useLocale, useTranslations } from "next-intl";

interface ContextWindowComparisonProps {
	selectedModels: ExtendedModel[];
}

type CompareTranslator = ReturnType<typeof useTranslations<"Catalogue.compare">>;

function getBarChartData(models: ExtendedModel[], t: CompareTranslator) {
	return [
		{
			type: t("inputContext"),
			...Object.fromEntries(
				models.map((m) => [
					m.name,
					m.input_context_length != null
						? m.input_context_length
						: null,
				])
			),
		},
		{
			type: t("outputContext"),
			...Object.fromEntries(
				models.map((m) => [
					m.name,
					m.output_context_length != null
						? m.output_context_length
						: null,
				])
			),
		},
	];
}

function getInfoSentence(models: ExtendedModel[], locale: string, t: CompareTranslator) {
	if (models.length < 2) return null;
	// Sort by input context length descending
	const sorted = [...models].sort(
		(a, b) => (b.input_context_length || 0) - (a.input_context_length || 0)
	);
	const [first, second] = sorted;
	const modelLink = (model: ExtendedModel) => (chunks: React.ReactNode) => (
		<Link href={`/models/${model.id}`} className="group">
			<span className="relative underline decoration-transparent group-hover:decoration-current transition-colors duration-200 font-semibold">
				{chunks}
			</span>
		</Link>
	);
	const number = (value: number | null | undefined) =>
		value == null ? "-" : value.toLocaleString(locale);

	return t.rich("contextSummary", {
		first: modelLink(first),
		firstInput: number(first.input_context_length),
		second: modelLink(second),
		secondInput: number(second.input_context_length),
		firstOutput: number(first.output_context_length),
		secondOutput: number(second.output_context_length),
	});
}

function BarChartTooltip({ active, payload, label }: any) {
	const t = useTranslations("Catalogue.compare");
	const locale = useLocale();
	if (!active || !payload || payload.length === 0) return null;
	return (
		<div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-3 border border-zinc-200 dark:border-zinc-800 min-w-[225px]">
			<div className="font-semibold text-sm mb-1">{label}</div>
			{payload.map((p: any) => (
				<div key={p.name} className="flex justify-between text-xs mb-1">
					<span>{p.name}</span>
					<span>
						{p.value != null ? p.value.toLocaleString(locale) : "-"}{" "}
						{t("tokenUnit")}
					</span>
				</div>
			))}
		</div>
	);
}

function getModelCountBadge(models: ExtendedModel[], t: CompareTranslator) {
	const withInfo = models.filter(
		(m) => m.input_context_length != null && m.output_context_length != null
	);
	if (withInfo.length === models.length) {
		return <Badge variant="outline" className="text-xs">{t("allModelsHaveContext")}</Badge>;
	}
	if (withInfo.length === 1) {
		return (
			<Badge variant="outline" className="text-xs">{t("oneModelHasContext")}</Badge>
		);
	}
	if (withInfo.length === 0) {
		return (
			<Badge variant="outline" className="text-xs">
				{t("noContextData")}
			</Badge>
		);
	}
	return (
		<Badge variant="outline" className="text-xs">
			{t("missingModels", { count: models.length - withInfo.length })}
		</Badge>
	);
}

export default function ContextWindowComparison({
	selectedModels,
}: ContextWindowComparisonProps) {
	const t = useTranslations("Catalogue.compare");
	const locale = useLocale();
	if (!selectedModels || selectedModels.length === 0) return null;

	const anyContext = selectedModels.some(
		(m) => m.input_context_length != null || m.output_context_length != null
	);
	if (!anyContext) return null;

	const infoSentence = getInfoSentence(selectedModels, locale, t);
	return (
		<section className="space-y-3">
			<header className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">{t("contextWindow")}</h2>
					<p className="text-sm text-muted-foreground">
						{t("contextWindowDescription")}
					</p>
				</div>
				{getModelCountBadge(selectedModels, t)}
			</header>

			<div className="space-y-4">
				{infoSentence && (
					<Card className="border-border/60 bg-background/60 shadow-sm">
						<CardContent className="py-4 text-sm text-left flex items-center justify-start">
							<span className="relative flex h-4 w-4 items-center justify-center mr-4 shrink-0">
								<span className="absolute h-6 w-6 rounded-full bg-blue-400/30" />
								<Info className="relative h-full w-full text-blue-500 shrink-0" />
							</span>
							<span>{infoSentence}</span>
						</CardContent>
					</Card>
				)}
				<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 w-full gap-4 mb-6">
					{selectedModels.map((model) => (
						<Card
							key={model.id}
							className="shadow border-none flex flex-col justify-between min-w-0"
						>
							<CardHeader className="flex flex-row items-center gap-3 pb-2">
								<ProviderLogoName
									id={model.provider.provider_id}
									name={model.provider.name}
									href={`/organisations/${model.provider.provider_id}`}
									size="sm"
									mobilePopover
								/>
								<div className="font-semibold truncate text-base leading-tight">
									<Link
										href={`/models/${
											model.id
										}`}
										className="group"
									>
										<span className="relative underline decoration-transparent group-hover:decoration-current transition-colors duration-200">
											{model.name}
										</span>
									</Link>
								</div>
							</CardHeader>
							<CardContent className="pt-0">
								<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm mb-1">
									<span className="text-muted-foreground">
									{t("inputContextLength")}
									</span>
									<span className="font-mono font-bold mt-1 sm:mt-0">
										{model.input_context_length != null
						? formatTokens(
									model.input_context_length,
									locale
											  )
											: "-"}
									</span>
								</div>
								<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm">
									<span className="text-muted-foreground">
									{t("outputContextLength")}
									</span>
									<span className="font-mono font-bold mt-1 sm:mt-0">
										{model.output_context_length != null
							? formatTokens(
									model.output_context_length,
									locale
											  )
											: "-"}
									</span>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
				<div className="hidden sm:block rounded-xl border border-border/60 bg-background/60 p-4 text-center mb-4">
					<ContextWindowBarChart
						chartData={getBarChartData(selectedModels, t)}
						models={selectedModels.map((m) => ({
							name: m.name,
							provider: m.provider.name,
						}))}
						CustomTooltip={BarChartTooltip}
						locale={locale}
						inputLabel={t("inputContext")}
						outputLabel={t("outputContext")}
						barGap={32}
					/>
				</div>
			</div>
		</section>
	);
}

// Helper for K/M/B formatting
function formatTokens(val: number | null | undefined, locale: string): string {
	if (val == null) return "-";
	if (val >= 1_000_000_000)
		return `${(val / 1_000_000_000).toLocaleString(locale, { maximumFractionDigits: 1 })}B`;
	if (val >= 1_000_000)
		return `${(val / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 })}M`;
	if (val >= 1_000)
		return `${(val / 1_000).toLocaleString(locale, { maximumFractionDigits: 1 })}K`;
	return val.toLocaleString(locale);
}
