import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, ArrowUpRight, Gauge, Timer } from "lucide-react";
import { DisplayNumber } from "@/components/display/DisplayValue";

import type { OrganisationModelCards } from "@/lib/fetchers/organisations/types";

type Metric = {
	icon: typeof Gauge;
	id: "throughput" | "latency" | "usage";
	label: string;
	format: (value: number, model: OrganisationModelCards) => ReactNode;
	value: (model: OrganisationModelCards) => number | null | undefined;
};

const metrics: Metric[] = [
	{
		icon: Gauge,
		id: "throughput",
		label: "Throughput",
		format: (value) => <><DisplayNumber value={value} options={{ maximumFractionDigits: 1, notation: "standard" }} /> t/s</>,
		value: (model) => model.throughput_week,
	},
	{
		icon: Timer,
		id: "latency",
		label: "Time to first token",
		format: (value) => <><DisplayNumber value={Math.round(value)} options={{ maximumFractionDigits: 0, notation: "standard" }} /> ms</>,
		value: (model) => model.latency_week,
	},
	{
		icon: Activity,
		id: "usage",
		label: "Weekly usage",
		format: (value, model) => <><DisplayNumber value={value} /> {model.weekly_usage_unit ?? "units"}</>,
		value: (model) => model.weekly_usage_quantity,
	},
];

export default function LabPerformance({
	models,
}: {
	models: OrganisationModelCards[];
}) {
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
										No recent data
									</p>
								) : null}
							</div>
						</div>
					);
				})}
			</div>
			{!hasTelemetry ? (
				<p className="border-t border-border/70 px-5 py-3 text-sm text-muted-foreground">
					Performance metrics will appear after this lab&apos;s models serve gateway traffic.
				</p>
			) : null}
		</div>
	);
}
