"use client";

import { useLocale, useTranslations } from "next-intl";
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, XAxis, YAxis, usePlotArea, useXAxisScale, useYAxisScale } from "recharts";
import { epochFrontier, type EpochDashboardRow, type EpochMetric } from "@/lib/benchmarks/epochDashboard";

export function epochColour(organisation: string) {
	const known: Record<string, string> = { Anthropic: "#d47757", OpenAI: "#10a37f", "Google DeepMind": "#4285f4", "Meta AI": "#6366f1", DeepSeek: "#0891b2", xAI: "#64748b", "Mistral AI": "#f59e0b", Alibaba: "#e87935" };
	if (known[organisation]) return known[organisation];
	const colours = ["#0891b2", "#8b5cf6", "#e87935", "#16a34a", "#db2777", "#6366f1", "#ca8a04"];
	return colours[[...organisation].reduce((sum, c) => sum + c.charCodeAt(0), 0) % colours.length];
}

type Point = { row: EpochDashboardRow; x: number; y: number };
function Points({ points, inspect, pin, selected, pinned, intervals }: { points: Point[]; inspect: (id: string | null) => void; pin: (id: string) => void; selected: string | null; pinned: string | null; intervals: boolean }) {
	const plot = usePlotArea(), xScale = useXAxisScale(), yScale = useYAxisScale();
	if (!plot || !xScale || !yScale) return null;
	const nearest = (event: React.MouseEvent<SVGElement> | React.PointerEvent<SVGElement>) => {
		const svg = event.currentTarget.ownerSVGElement, matrix = svg?.getScreenCTM();
		if (!svg || !matrix) return null;
		const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
		const cursor = point.matrixTransform(matrix.inverse());
		return points.reduce<{ id: string; distance: number } | null>((best, p) => {
			const x = xScale(p.x), y = yScale(p.y);
			if (typeof x !== "number" || typeof y !== "number") return best;
			const distance = Math.hypot(cursor.x - x, cursor.y - y);
			return (!best || distance < best.distance) && distance < 18 ? { id: p.row.id, distance } : best;
		}, null)?.id ?? null;
	};
	return <g onPointerMove={(event) => { const id = nearest(event); if (id) inspect(id); }}>{points.map(({ row, x, y }) => {
		const cx = xScale(x), cy = yScale(y), colour = epochColour(row.organisation), active = selected === row.id;
		if (typeof cx !== "number" || typeof cy !== "number") return null;
		const low = row.interval ? yScale(row.interval.low) : null, high = row.interval ? yScale(row.interval.high) : null;
		return <g key={row.id}>
			{intervals && typeof low === "number" && typeof high === "number" ? <path d={`M${cx},${low}V${high}M${cx - 3},${low}h6M${cx - 3},${high}h6`} stroke={colour} opacity={active ? 1 : 0.18} pointerEvents="none" /> : null}
			<circle cx={cx} cy={cy} r={active ? 7 : 4.5} fill={colour} opacity={!selected || active ? 0.9 : 0.25} stroke={active ? "var(--foreground)" : "var(--background)"} strokeWidth={active ? 2 : 1} pointerEvents="none" />
			<circle cx={cx} cy={cy} r={9} fill="transparent" role="button" tabIndex={0} aria-label={`${row.name}: ${y.toFixed(2)}`} aria-pressed={pinned === row.id} className="cursor-pointer focus-visible:stroke-foreground focus-visible:stroke-2" onPointerEnter={() => inspect(row.id)} onFocus={() => inspect(row.id)} onBlur={() => inspect(null)} onClick={(event) => pin(nearest(event) ?? row.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pin(row.id); } }}><title>{row.name}</title></circle>
		</g>;
	})}</g>;
}

export function EpochDashboardChart({ rows, metric, mode, frontier, intervals, inspect, pin, selected, pinned }: { rows: EpochDashboardRow[]; metric: EpochMetric; mode: "timeline" | "domain"; frontier: boolean; intervals: boolean; inspect: (id: string | null) => void; pin: (id: string) => void; selected: string | null; pinned: string | null }) {
	const t = useTranslations("Catalogue.benchmarks.epochExplorer"), locale = useLocale();
	const points = rows.flatMap((row) => { const x = mode === "timeline" ? row.date ? Date.parse(row.date) : null : row.scores.overall, y = row.scores[metric]; return x !== null && Number.isFinite(x) && y !== null ? [{ row, x, y }] : []; });
	if (!points.length) return <div className="flex min-h-96 items-center justify-center p-8 text-sm text-muted-foreground">{t("noChartData")}</div>;
	const ys = points.flatMap((p) => intervals && metric === "overall" && p.row.interval ? [p.row.interval.low, p.row.interval.high] : [p.y]);
	const xs = points.map((p) => p.x), yMin = Math.floor(Math.min(...ys) / 10) * 10 - 5, yMax = Math.ceil(Math.max(...ys) / 10) * 10 + 5;
	const xPad = mode === "timeline" ? Math.max(86_400_000 * 30, (Math.max(...xs) - Math.min(...xs)) * 0.025) : 5;
	const line = mode === "timeline" && metric === "overall" && frontier ? epochFrontier(rows).map((row) => ({ x: Date.parse(row.date!), y: row.scores.overall })) : [];
	return <div className="h-[420px] w-full min-w-0 sm:h-[520px]" onPointerLeave={() => inspect(null)}>
		<ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 520 }}>
			<ComposedChart margin={{ top: 24, right: 24, bottom: 28, left: 0 }} accessibilityLayer={false}>
				<CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
				<XAxis type="number" dataKey="x" domain={[Math.min(...xs) - xPad, Math.max(...xs) + xPad]} tickCount={5} tickFormatter={(v: number) => mode === "timeline" ? new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit", timeZone: "UTC" }).format(v) : v.toLocaleString(locale, { maximumFractionDigits: 0 })} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={35} label={{ value: mode === "timeline" ? t("releaseDate") : t("overall"), position: "insideBottom", offset: -20, fontSize: 11, fill: "var(--muted-foreground)" }} />
				<YAxis type="number" dataKey="y" domain={[yMin, yMax]} width={48} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
				<Scatter data={points} dataKey="y" shape={() => <g />} isAnimationActive={false} />
				{line.length > 1 ? <Line data={line} dataKey="y" type="stepAfter" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} /> : null}
				{mode === "domain" ? <ReferenceLine segment={[{ x: Math.min(...xs) - 5, y: Math.min(...xs) - 5 }, { x: Math.max(...xs) + 5, y: Math.max(...xs) + 5 }]} stroke="var(--muted-foreground)" strokeDasharray="5 4" ifOverflow="hidden" /> : null}
				<Points points={points} inspect={inspect} pin={pin} selected={selected} pinned={pinned} intervals={intervals && metric === "overall"} />
			</ComposedChart>
		</ResponsiveContainer>
	</div>;
}
