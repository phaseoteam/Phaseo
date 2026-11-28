import { useState } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { useLocale, useTranslations } from "@/i18n/react";
import { Button } from "@/components/ui/button";
import { formatBenchmarkValue, formatUsd, type BenchmarkScale, type LeaderboardEntry } from "@/lib/benchmarks/boardResults";
import { cn } from "@/lib/utils";

type Point = { x: number; y: number; name: string; colour: string; top: boolean };

const NEUTRAL = "var(--muted-foreground)";

/** Evenly spaced axis ticks: month starts for dates, 1-2-5 steps for costs on a log scale. */
export function chartTicks(axis: "release" | "cost", values: number[]): number[] {
	if (!values.length) return [];
	const min = Math.min(...values);
	const max = Math.max(...values);
	if (axis === "cost") {
		const ticks: number[] = [];
		for (let exponent = Math.floor(Math.log10(min)); exponent <= Math.ceil(Math.log10(max)); exponent += 1) {
			for (const step of [1, 2, 5]) {
				const tick = step * 10 ** exponent;
				if (tick >= min / 1.5 && tick <= max * 1.5) ticks.push(tick);
			}
		}
		return ticks.length > 8 ? ticks.filter((tick) => String(tick).replace(/[0.]/g, "").startsWith("1")) : ticks;
	}
	const start = new Date(min);
	const end = new Date(max);
	const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
	const step = [1, 2, 3, 6, 12, 24].find((candidate) => months / candidate <= 6) ?? 24;
	const ticks: number[] = [];
	const cursor = new Date(Date.UTC(start.getUTCFullYear(), Math.ceil(start.getUTCMonth() / step) * step, 1));
	while (cursor.getTime() <= max) {
		ticks.push(cursor.getTime());
		cursor.setUTCMonth(cursor.getUTCMonth() + step);
	}
	return ticks;
}

/** Score against release date, or against cost when the board publishes cost. */
export function BenchmarkBoardChart({ entries, scale, axes }: { entries: LeaderboardEntry[]; scale: BenchmarkScale; axes: Array<"release" | "cost"> }) {
	const t = useTranslations("Catalogue.benchmarks.board");
	const locale = useLocale();
	const [axis, setAxis] = useState<"release" | "cost">(axes.includes("cost") ? "cost" : axes[0]);
	const ranked = entries.filter((entry) => entry.best.score != null);
	const topIds = new Set(ranked.slice(0, 10).map((entry) => entry.best.modelId));
	const points: Point[] = ranked.flatMap((entry) => {
		const row = entry.best;
		const x = axis === "cost" ? row.costUsd : row.releaseDate ? new Date(row.releaseDate).getTime() : null;
		if (x == null || !Number.isFinite(x) || (axis === "cost" && x <= 0)) return [];
		return [{ x, y: row.score!, name: row.modelName, colour: row.organisationColour || NEUTRAL, top: topIds.has(row.modelId) }];
	});
	const dateFormat = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
	const formatX = (value: number) => (axis === "cost" ? formatUsd(value) : dateFormat.format(new Date(value)));
	const formatY = (value: number) => formatBenchmarkValue(value, scale, locale);

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2 className="text-xl font-semibold tracking-tight">{axis === "cost" ? t("chartCostTitle") : t("chartReleaseTitle")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">{scale.higherIsBetter ? t("chartHelpHigher") : t("chartHelpLower")}</p>
				</div>
				{axes.length > 1 ? (
					<div role="group" aria-label={t("chartAxis")} className="inline-flex rounded-md border p-0.5">
						{axes.map((value) => (
							<Button key={value} type="button" size="sm" variant="ghost" aria-pressed={axis === value} onClick={() => setAxis(value)} className={cn("h-7 rounded-[4px] px-2.5 text-xs", axis === value && "bg-muted text-foreground")}>
								{value === "cost" ? t("axisCost") : t("axisRelease")}
							</Button>
						))}
					</div>
				) : null}
			</div>
			<div className="h-[340px] w-full rounded-md border p-3">
				<ResponsiveContainer width="100%" height="100%">
					<ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
						<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
						<XAxis
							type="number"
							dataKey="x"
							scale={axis === "cost" ? "log" : "time"}
							domain={axis === "cost" ? ["auto", "auto"] : ["dataMin", "dataMax"]}
							ticks={chartTicks(axis, points.map((point) => point.x))}
							tickFormatter={formatX}
							tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
							stroke="var(--border)"
							name={axis === "cost" ? t("axisCost") : t("axisRelease")}
						/>
						<YAxis type="number" dataKey="y" domain={["auto", "auto"]} tickFormatter={formatY} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" width={64} />
						<Tooltip
							cursor={{ strokeDasharray: "3 3" }}
							content={({ active, payload }) => {
								const point = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
								if (!point) return null;
								return (
									<div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
										<p className="font-medium">{point.name}</p>
										<p className="mt-1 tabular-nums">{formatY(point.y)}</p>
										<p className="tabular-nums text-muted-foreground">{formatX(point.x)}</p>
									</div>
								);
							}}
						/>
						<Scatter
							data={points}
							isAnimationActive={false}
							shape={(props: { cx?: number; cy?: number; payload?: Point }) => (
								<circle cx={props.cx} cy={props.cy} r={props.payload?.top ? 5 : 3.5} fill={props.payload?.colour ?? NEUTRAL} fillOpacity={props.payload?.top ? 0.95 : 0.55} stroke="var(--background)" strokeWidth={1} />
							)}
						/>
					</ScatterChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
}
