"use client";

import React from "react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis } from "recharts";

type RangeKey = "1h" | "1d" | "1w" | "1m" | "1y";

type Row = {
	created_at: string;
	usage?: any;
	cost_nanos?: number | null;
	model_id?: string | null;
	key_id?: string | null;
};

function bucketFor(
	d: Date,
	range: RangeKey,
	formatDateParts: ReturnType<typeof useDisplayFormatters>["dateParts"],
): string {
	if (range === "1h") {
		const minutes = Math.floor(d.getMinutes() / 5) * 5;
		d.setMinutes(minutes, 0, 0);
		return formatDateParts(d, { hour: "2-digit", minute: "2-digit" });
	}
	if (range === "1d") return formatDateParts(d, { hour: "2-digit", minute: "2-digit" });
    if (range === "1m" || range === "1w")
        return formatDateParts(d, {
            month: "short",
            day: "2-digit",
        });
    return formatDateParts(d, { month: "short", year: "numeric" });
}

function getTokens(u: any) {
	const input = Number(u?.input_text_tokens ?? u?.input_tokens ?? 0) || 0;
	const output = Number(u?.output_text_tokens ?? u?.output_tokens ?? 0) || 0;
	return input + output;
}

type TooltipProps = {
	metric: "requests" | "tokens" | "spend";
	seriesStyle: Record<
		string,
		{ label: string; color: string; stroke: string }
	>;
	hoveredKey: string | null;
	setHoveredKey: (k: string | null) => void;
};

function UsageTooltipContent(props: TooltipProps & Record<string, any>) {
	const format = useDisplayFormatters();
	// Recharts will clone the `content` element and pass tooltip props
	// such as `payload`, `label` and `active`. We must forward those
	// to the inner `ChartTooltipContent` so it can render the tooltip.
	const {
		metric,
		seriesStyle,
		hoveredKey /*, setHoveredKey (unused)*/,
		...rest
	} = props;

	return (
		<ChartTooltipContent
			{...rest}
			labelFormatter={(lbl) => String(lbl)}
			formatter={(v, name, item) => {
				const val = Number(v ?? 0);
				const formatted = isFinite(val)
					? metric === "spend"
						? format.number(val, {
								style: "currency",
								currency: "USD",
								minimumFractionDigits: 0,
								maximumFractionDigits: 5,
								notation: "standard",
							})
						: format.number(Math.round(val), {
								maximumFractionDigits: 0,
								notation: "standard",
							})
					: "0";
				const seriesKey = String(item?.dataKey ?? name ?? "");
				const cfg = (seriesStyle as any)[seriesKey];
				const labelText = cfg?.label ?? String(name ?? "");
				const isActive = hoveredKey === seriesKey;

				return (
					<>
						<span className="inline-flex items-center gap-2">
							<span
								className="inline-block rounded-[2px]"
								style={{
									backgroundColor: cfg?.color,
									width: isActive ? 6 : 4,
									height: 14,
								}}
							/>
							<span className={isActive ? "font-medium" : ""}>
								{labelText}
							</span>
						</span>
						<span className="ml-auto font-mono">{formatted}</span>
					</>
				);
			}}
		/>
	);
}

/* ---------------- Pastel colour utilities ---------------- */

// ---------- hashing ----------
function hash32(str: string) {
	let h = 0x811c9dc5 >>> 0;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
	}
	return h >>> 0;
}

// ---------- default pastels (can override via prop) ----------
const DEFAULT_PASTELS = [
	"#A7C7E7",
	"#F7C5CC",
	"#C1E5C0",
	"#F8D7A9",
	"#D4C2FC",
	"#FFE3A3",
	"#BFE3F2",
	"#FFD0E1",
	"#C8F0DD",
	"#FBE2B4",
];

// Golden angle for far-apart picks
const GOLDEN_ANGLE = 137.508;

// Given a list of model names, return stable, well-separated colours
function assignSeriesColours(
	models: string[],
	palette?: string[]
): Record<string, { fill: string; stroke: string }> {
	const entries = models
		.map((m) => ({ m, h: hash32(m) }))
		.sort((a, b) => a.h - b.h);

	const out: Record<string, { fill: string; stroke: string }> = {};

	if (palette && palette.length) {
		// Spread across palette with golden-angle stepping
		const step = Math.max(1, Math.round(palette.length * 0.381966)); // ~1/phi^2
		entries.forEach((e, i) => {
			const idx = (e.h + i * step) % palette.length;
			const fill = palette[idx];
			out[e.m] = { fill, stroke: fill };
		});
		return out;
	}

	// HSL pastel generator with golden-angle hue spacing
	const SAT = 45; // pastel
	const LIT = 78; // pastel
	entries.forEach((e, i) => {
		const hue = ((e.h % 360) + i * GOLDEN_ANGLE) % 360;
		const fill = `hsl(${hue} ${SAT}% ${LIT}% / 0.88)`;
		const stroke = `hsl(${hue} ${Math.max(30, SAT - 10)}% ${Math.max(
			55,
			LIT - 20
		)}% / 0.95)`;
		out[e.m] = { fill, stroke };
	});
	return out;
}

type GroupMode = "model" | "key";

function keyForSeries(value: string, mode: GroupMode) {
	const prefix = mode === "key" ? "k" : "m";
	const safe = value.replace(/[^a-zA-Z0-9]+/g, "_") || "unknown";
	return `${prefix}_${safe}`;
}

type KeyMeta = {
	id: string;
	name?: string | null;
	prefix?: string | null;
};

type Props = {
	range: RangeKey;
	rows: Row[];
	windowLabel: string;
	/** Optional custom pastel palette; models map deterministically to items here */
	colorPalette?: string[];
	groupMode?: GroupMode;
	keyMeta?: KeyMeta[];
};

export default function UsageOverviewChart({
	range,
	rows,
	windowLabel,
	colorPalette,
	groupMode = "model",
	keyMeta = [],
}: Props) {
	const format = useDisplayFormatters();
	const [metric, setMetric] = React.useState<"requests" | "tokens" | "spend">(
		"tokens"
	);

	const [hoveredKey, setHoveredKey] = React.useState<string | null>(null);

	// Build list of buckets across the requested window so missing buckets are represented as 0
	function buildBucketsForWindow(range: RangeKey) {
		const now = new Date();
		const start = new Date(now);
        if (range === "1h") {
            start.setHours(now.getHours() - 1);
            start.setMinutes(Math.floor(start.getMinutes() / 5) * 5, 0, 0);
        } else if (range === "1d") {
            start.setDate(now.getDate() - 1);
            start.setMinutes(0, 0, 0);
        } else if (range === "1w") {
            start.setDate(now.getDate() - 7);
            start.setHours(0, 0, 0, 0);
        } else if (range === "1m") {
            start.setMonth(now.getMonth() - 1);
            start.setHours(0, 0, 0, 0);
        } else {
            start.setFullYear(now.getFullYear() - 1);
            start.setHours(0, 0, 0, 0);
        }

		const buckets: string[] = [];
		const cursor = new Date(start.getTime());

		const pushAndAdvance = () => {
			buckets.push(bucketFor(new Date(cursor), range, format.dateParts));
        if (range === "1h") cursor.setMinutes(cursor.getMinutes() + 5);
        else if (range === "1d") cursor.setHours(cursor.getHours() + 1);
        else if (range === "1w" || range === "1m") cursor.setDate(cursor.getDate() + 1);
        else cursor.setMonth(cursor.getMonth() + 1);
		};

		let iterations = 0;
		while (cursor.getTime() <= now.getTime() && iterations < 10000) {
			pushAndAdvance();
			iterations++;
		}

		return buckets;
	}

	const TOP_N = 10;

	const keyMetaMap = React.useMemo(
		() => new Map(keyMeta.map((k) => [k.id, k])),
		[keyMeta]
	);

	const formatSeriesLabel = React.useCallback(
		(id: string) => {
			if (groupMode === "model") return id;
			const UNKNOWN = "unknown";
			if (id === UNKNOWN)
				return "Unknown key";
			const meta = keyMetaMap.get(id);
			if (!meta) {
				if (id.length <= 12) return id;
				return `${id.slice(0, 8)}...${id.slice(-4)}`;
			}
			const name = meta.name?.trim();
			const prefix = meta.prefix?.trim();
			if (name) return name;
			if (prefix) return prefix;
			if (meta.id.length <= 12) return meta.id;
			return `${meta.id.slice(0, 8)}...${meta.id.slice(-4)}`;
		},
		[groupMode, keyMetaMap]
	);

	const { data, label, seriesKeys, seriesStyle, seriesMeta } =
		React.useMemo(() => {
			const UNKNOWN = "unknown";
			const buckets = buildBucketsForWindow(range);

			const perBucketPerGroup = new Map<string, Map<string, number>>();
			const totalsByGroup = new Map<string, number>();
			let totalAll = 0;

			rows.forEach((r) => {
				const b = bucketFor(new Date(r.created_at), range, format.dateParts);
				const groupValue =
					groupMode === "key"
						? (r as any)?.key_id
							? String((r as any).key_id)
							: UNKNOWN
						: (r as any)?.model_id
						? String((r as any).model_id)
						: UNKNOWN;
				let v = 0;
				if (metric === "requests") v = 1;
				else if (metric === "tokens") v = getTokens(r.usage);
				else v = Number(r.cost_nanos ?? 0) / 1e9;

				if (!perBucketPerGroup.has(b))
					perBucketPerGroup.set(b, new Map());
				const m = perBucketPerGroup.get(b)!;
				m.set(groupValue, (m.get(groupValue) ?? 0) + v);

				totalsByGroup.set(
					groupValue,
					(totalsByGroup.get(groupValue) ?? 0) + v
				);
				totalAll += v;
			});

			const sortedGroups = Array.from(totalsByGroup.entries())
				.sort((a, b) => b[1] - a[1])
				.map(([group]) => group);
			const topGroups = sortedGroups.slice(0, TOP_N);
			const useOther = sortedGroups.length > TOP_N;
			const isTop = new Set(topGroups);

			// NEW: compute well-separated pastel colours for the top models
			const colourMap = assignSeriesColours(
				topGroups,
				colorPalette ?? DEFAULT_PASTELS
			);

			const cfg: Record<
				string,
				{ label: string; color: string; stroke: string }
			> = {};
			const keys: string[] = [];

			topGroups.forEach((groupVal) => {
				const key = keyForSeries(groupVal, groupMode);
				const c = colourMap[groupVal];
				keys.push(key);
				cfg[key] = {
					label: formatSeriesLabel(groupVal),
					color: c.fill,
					stroke: c.stroke,
				};
			});

			if (useOther) {
				keys.push("other");
				cfg["other"] = {
					label: "Other",
					color: "hsl(0 0% 70% / 0.6)",
					stroke: "hsl(0 0% 50%)",
				};
			}

			const data = buckets.map((t) => {
				const row: Record<string, any> = { t };
				const m = perBucketPerGroup.get(t) ?? new Map();
				keys.forEach((k) => (row[k] = 0));
				let otherSum = 0;
				m.forEach((val, groupVal) => {
					if (isTop.has(groupVal)) {
						const key = keyForSeries(groupVal, groupMode);
						row[key] = (row[key] ?? 0) + val;
					} else {
						otherSum += val;
					}
				});
				if (useOther) row["other"] = otherSum;
				return row;
			});

			const label =
				metric === "spend"
					? "USD"
					: metric === "tokens"
					? "Tokens"
					: "Requests";
			return {
				data,
				label,
				seriesKeys: keys,
				seriesStyle: cfg, // colours + strokes
				seriesMeta: { topGroups, groupMode }, // for debugging/extension if needed
			};
		}, [rows, range, metric, colorPalette, groupMode, formatSeriesLabel]);

	// Feed these into ChartContainer so it exposes CSS vars like --color-<seriesKey>
	const chartConfig = {
		value: { label: "Usage", color: "hsl(var(--primary))" },
		...(Object.fromEntries(
			Object.entries(seriesStyle).map(([k, v]) => [
				k,
				{ label: v.label, color: v.color },
			])
		) as any),
	} as const;

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-8">
				<CardTitle className="text-sm font-medium">
					Usage Overview
				</CardTitle>
				<ToggleGroup
					type="single"
					value={metric}
					onValueChange={(v) => v && setMetric(v as any)}
					size="sm"
					variant="outline"
				>
					<ToggleGroupItem
						value="requests"
						className="px-4 h-8 text-sm"
					>
						Requests
					</ToggleGroupItem>
					<ToggleGroupItem
						value="tokens"
						className="px-4 h-8 text-sm"
					>
						Tokens
					</ToggleGroupItem>
					<ToggleGroupItem value="spend" className="px-4 h-8 text-sm">
						Cost
					</ToggleGroupItem>
				</ToggleGroup>
			</CardHeader>
			<CardContent>
				{/* Intentionally removed window label and projection - show only title and chart */}

				<ChartContainer
					config={chartConfig as any}
					className="h-[300px] w-full"
				>
					<BarChart
						data={data}
						margin={{ left: 0, right: 12 }}
						// Reset highlight when leaving the plot area
						onMouseLeave={() => setHoveredKey(null)}
					>
						<CartesianGrid vertical={false} />
						<XAxis dataKey="t" tickLine={false} axisLine={false} />
						<YAxis tickLine={false} axisLine={false} />

						<ChartTooltip
							content={
								<UsageTooltipContent
									metric={metric}
									seriesStyle={seriesStyle as any}
									hoveredKey={hoveredKey}
									setHoveredKey={setHoveredKey}
								/>
							}
						/>

						{seriesKeys.map((key) => {
							const s = (seriesStyle as any)[key];
							const active = hoveredKey
								? hoveredKey === key
								: true;
							return (
								<Bar
									key={key}
									dataKey={key}
									name={s?.label}
									stackId="a"
									fill={`var(--color-${key}, ${s?.color})`}
									stroke={s?.stroke ?? s?.color}
									// Emphasis: active series full, others dim
									fillOpacity={
										hoveredKey ? (active ? 0.95 : 0.4) : 0.9
									}
									strokeOpacity={
										hoveredKey ? (active ? 0.95 : 0.5) : 0.9
									}
									strokeWidth={active ? 1.1 : 0.8}
									// Capture hover to set the active series
									onMouseOver={() => setHoveredKey(key)}
									onMouseOut={() => setHoveredKey(null)}
									isAnimationActive={false}
								/>
							);
						})}
					</BarChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
