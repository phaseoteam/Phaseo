"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { ProviderModel } from "@/lib/fetchers/models/getModelPricing";
import { extractSupportedParameters } from "@/lib/fetchers/models/table-view/helpers";
import {
	Sliders,
} from "lucide-react";

export function prettifyParamName(name: string): string {
	return name
		.replace(/[._-]+/g, " ")
		.trim()
		.split(/\s+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export type ParameterMetadataStatus = "documented" | "partial" | "unknown";

export interface ParameterSupportSummary {
	parameters: string[];
	status: ParameterMetadataStatus;
	documentedRouteCount: number;
	unknownRouteCount: number;
}

export function buildParameterSupportSummary(
	models: ProviderModel[],
): ParameterSupportSummary {
	const parameters = new Set<string>();
	let documentedRouteCount = 0;
	let unknownRouteCount = 0;

	for (const model of models) {
		const routeParameters = extractSupportedParameters(model.params);
		if (routeParameters.length === 0) {
			unknownRouteCount += 1;
			continue;
		}

		documentedRouteCount += 1;
		for (const param of routeParameters) parameters.add(param);
	}

	const sortedParameters = Array.from(parameters).sort((a, b) =>
		a.localeCompare(b),
	);
	const status: ParameterMetadataStatus =
		sortedParameters.length === 0
			? "unknown"
			: unknownRouteCount > 0
				? "partial"
				: "documented";

	return {
		parameters: sortedParameters,
		status,
		documentedRouteCount,
		unknownRouteCount,
	};
}

export function buildSupportedParameters(models: ProviderModel[]): string[] {
	return buildParameterSupportSummary(models).parameters;
}

export default function ProviderModelParameters({
	models = [],
}: {
	models?: ProviderModel[];
}) {
	const t = useTranslations("Catalogue.models.detail.quickstart");
	const parameters = buildSupportedParameters(models);
	if (!parameters.length) return null;

	return (
		<HoverCard openDelay={150} closeDelay={120}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					aria-label={t("parameterSupport")}
					className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:border-slate-300 hover:text-foreground dark:hover:border-slate-700"
				>
					<Sliders className="h-3.5 w-3.5" />
				</button>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-80 p-3 text-xs">
				<div className="space-y-2">
					<p className="text-muted-foreground">{t("parameterSupport")}</p>
					<div className="max-h-72 overflow-auto pr-1">
						<div className="flex flex-wrap gap-1.5">
							{parameters.map((param) => (
								<Badge key={param} variant="outline" className="text-xs">
									{prettifyParamName(param)}
								</Badge>
							))}
						</div>
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
