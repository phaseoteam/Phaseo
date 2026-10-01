import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Activity, ArrowUpRight, Gauge, Timer } from "lucide-react";

import type { OrganisationModelCards } from "@/lib/fetchers/organisations/types";

type Metric = {
	icon: typeof Gauge;
	id: "throughput" | "latency" | "usage";
	label: string;
	format: (value: number, model: OrganisationModelCards) => string;
	value: (model: OrganisationModelCards) => number | null | undefined;
};

export default async function LabPerformance({
	models,
}: {
	models: OrganisationModelCards[];
}) {
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.organisations");
	const compactNumber = new Intl.NumberFormat(locale, {
		compactDisplay: "short",
		notation: "compact",
		maximumFractionDigits: 1,
	});
	const metrics: Metric[] = [
		{
			icon: Gauge,
			id: "throughput",
			label: t("throughput"),
			format: (value) => `${value.toLocaleString(locale, { maximumFractionDigits: 1 })} t/s`,
			value: (model) => model.throughput_week,
		},
		{
			icon: Timer,
			id: "latency",
			label: t("timeToFirstToken"),
			format: (value) => `${Math.round(value).toLocaleString(locale)} ms`,
			value: (model) => model.latency_week,
		},
		{
			icon: Activity,
			id: "usage",
			label: t("weeklyUsage"),
			format: (value, model) => {
				const unit = model.weekly_usage_unit?.toLowerCase();
				const unitLabel = unit === "tokens" ? t("unitTokens") : unit === "requests" ? t("unitRequests") : model.weekly_usage_unit || t("unitGeneric");
				return `${compactNumber.format(value)} ${unitLabel}`;
			},
			value: (model) => model.weekly_usage_quantity,
		},
	];
	const panels = metrics.map((metric) => ({
		...metric,
		models: models
			.map((model) => ({ model, value: metric.value(model) }))
			.filter(
				(entry): entry is { model: OrganisationModelCards; value: number } =>
					typeof entry.value === "number" && Number.isFinite(entry.value),
			)
			.sort((a, b) =>
				metric.id === "latency" ? a.value - b.value : b.value - a.value,
			)
			.slice(0, 3),
	}));
	const hasTelemetry = panels.some((panel) => panel.models.length > 0);

	return (
		<div className="overflow-hidden rounded-lg border border-border/70 bg-background">
			<div className="grid md:grid-cols-3 md:divide-x md:divide-border/70">
				{panels.map((panel) => {
					const Icon = panel.icon;
					return (
						<div
							key={panel.id}
							className="min-w-0 border-b border-border/70 p-4 last:border-b-0 md:border-b-0 md:p-5"
						>
							<div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
								<Icon className="size-3.5" />
								{panel.label}
							</div>
							<p className="mt-2 text-2xl font-semibold tracking-tight">
								{panel.models[0] ? panel.format(panel.models[0].value, panel.models[0].model) : "—"}
							</p>
							<div className="mt-4 space-y-1">
								{panel.models.map(({ model, value }) => (
									<Link
										key={model.model_id}
										href={`/models/${model.model_id}`}
										className="group flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted/60"
									>
										<span className="truncate font-medium">{model.name}</span>
										<span className="flex shrink-0 items-center gap-1 text-muted-foreground">
											{panel.format(value, model)}
											<ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
										</span>
									</Link>
								))}
								{panel.models.length === 0 ? (
									<p className="px-2 py-1.5 text-xs text-muted-foreground">
										{t("noRecentData")}
									</p>
								) : null}
							</div>
						</div>
					);
				})}
			</div>
			{!hasTelemetry ? (
				<p className="border-t border-border/70 px-5 py-3 text-sm text-muted-foreground">
				{t("gatewayMetricsWillAppear")}
				</p>
			) : null}
		</div>
	);
}
