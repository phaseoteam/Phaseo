"use client";

import React from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "@/components/ui/copy-button";
import { Badge } from "@/components/ui/badge";
import {
	CheckCircle2,
	XCircle,
	AlertTriangle,
	Clock,
	Activity,
	Coins,
	Gauge,
	Cpu,
	Network,
	Hash,
	Layers,
	CaseUpper,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { PieChart, Pie, Cell } from "recharts";

export type SuccessfulRow = {
	request_id?: string | null;
	created_at: string;
	provider?: string | null;
	model_id?: string | null;
	usage?: any;
	cost_nanos?: number | null;
	generation_ms?: number | null;
	latency_ms?: number | null;
	success?: boolean | null;
	status_code?: number | null;
};

function totalFromBreakdown(usage: any) {
	const items = buildTokenBreakdown(usage);
	return items.reduce((s, it) => s + it.value, 0);
}
const getTokens = (u: any) => totalFromBreakdown(u);

function formatUSDFromNanos(n?: number | null, dp = 5) {
	const dollars = Number(n ?? 0) / 1e9;
	return dollars.toFixed(dp);
}

function niceDate(iso: string) {
	try {
		return new Date(iso).toLocaleString();
	} catch {
		return iso;
	}
}

function formatHeaderTime(iso?: string | null) {
	if (!iso) return "-";
	try {
		const d = new Date(iso);
		const now = new Date();

		const pad = (n: number) => n.toString().padStart(2, "0");
		const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

		// same day
		if (
			d.getFullYear() === now.getFullYear() &&
			d.getMonth() === now.getMonth() &&
			d.getDate() === now.getDate()
		) {
			return hhmm;
		}

		// same year
		if (d.getFullYear() === now.getFullYear()) {
			return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${hhmm}`;
		}

		// different year
		return `${pad(d.getDate())}/${pad(
			d.getMonth() + 1
		)}/${d.getFullYear()} ${hhmm}`;
	} catch {
		return iso;
	}
}

function statusBadge(success?: boolean | null, code?: number | null) {
	const codeText = code ? ` · ${code}` : "";
	if (success === true) {
		return (
			<Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600 text-white">
				<CheckCircle2 className="h-3.5 w-3.5" />
				Success{codeText}
			</Badge>
		);
	}
	if (success === false) {
		return (
			<Badge className="gap-1 bg-rose-600 hover:bg-rose-600 text-white">
				<XCircle className="h-3.5 w-3.5" />
				Failed{codeText}
			</Badge>
		);
	}
	return (
		<Badge className="gap-1 bg-amber-600 hover:bg-amber-600 text-white">
			<AlertTriangle className="h-3.5 w-3.5" />
			Unknown{codeText}
		</Badge>
	);
}

function modelPill(model?: string | null) {
	return (
		<Badge variant="secondary" className="gap-1">
			<Cpu className="h-3.5 w-3.5" />
			{model ?? "-"}
		</Badge>
	);
}

function providerPill(provider?: string | null) {
	return (
		<Badge variant="outline" className="gap-1">
			<Network className="h-3.5 w-3.5" />
			{provider ?? "-"}
		</Badge>
	);
}

function MetricTile({
	icon,
	label,
	value,
	sub,
	tone = "slate",
}: {
	icon: React.ReactNode;
	label: string;
	value: React.ReactNode;
	sub?: React.ReactNode;
	tone?: "slate" | "emerald" | "violet" | "sky" | "rose" | "amber";
}) {
	const toneMap: Record<string, string> = {
		slate: "bg-slate-600/10 text-slate-700 dark:text-slate-200",
		emerald: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
		violet: "bg-violet-600/10 text-violet-700 dark:text-violet-300",
		sky: "bg-sky-600/10 text-sky-700 dark:text-sky-300",
		rose: "bg-rose-600/10 text-rose-700 dark:text-rose-300",
		amber: "bg-amber-600/10 text-amber-700 dark:text-amber-300",
	};
	return (
		<div className="rounded-2xl border bg-card p-4">
			<div className="flex items-center justify-between">
				<div
					className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneMap[tone]}`}
				>
					{icon}
				</div>
			</div>
			<div className="mt-3 text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 text-lg font-semibold tracking-tight">
				{value}
			</div>
			{sub ? (
				<div className="mt-1 text-xs text-muted-foreground">{sub}</div>
			) : null}
		</div>
	);
}

function TimingBar({
	latency,
	generation,
}: {
	latency: number;
	generation: number;
}) {
	const safeGen = Math.max(0, generation);
	const safeLat = Math.max(0, latency);
	const total = Math.max(1, Math.max(safeGen, safeLat));
	const latPct = Math.min(100, Math.round((safeLat / total) * 100));
	const genPct = Math.min(100, Math.round((safeGen / total) * 100));
	// If latency > generation, still show both reasonably
	const latWidth = Math.min(100, Math.max(5, latPct));
	const genWidth = Math.min(100, Math.max(5, genPct));

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span className="flex items-center gap-1">
					<Clock className="h-3.5 w-3.5" />
					Time to first token
				</span>
				<span>{safeLat} ms</span>
			</div>
			<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-2 bg-amber-500"
					style={{ width: `${latWidth}%` }}
					aria-label="Latency portion"
				/>
			</div>

			<div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
				<span className="flex items-center gap-1">
					<Activity className="h-3.5 w-3.5" />
					Total generation
				</span>
				<span>{safeGen} ms</span>
			</div>
			<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-2 bg-violet-500"
					style={{ width: `${genWidth}%` }}
					aria-label="Generation portion"
				/>
			</div>
		</div>
	);
}

function toTitleCaseKey(k: string) {
	return k
		.replace(/_/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildTokenBreakdown(
	usage: any
): { key: string; label: string; value: number }[] {
	// Flatten arrays by aggregating
	if (Array.isArray(usage)) {
		const acc = new Map<string, number>();
		for (const u of usage) {
			for (const item of buildTokenBreakdown(u)) {
				acc.set(item.key, (acc.get(item.key) ?? 0) + item.value);
			}
		}
		return Array.from(acc.entries())
			.map(([key, value]) => ({ key, label: toTitleCaseKey(key), value }))
			.sort((a, b) => b.value - a.value);
	}

	if (!usage || typeof usage !== "object") return [];

	const entries = Object.entries(usage)
		.filter(([k, v]) => {
			const n = Number(v);
			if (!isFinite(n) || n <= 0) return false;
			const lk = String(k).toLowerCase();
			if (lk === "total_tokens") return false; // exclude aggregate
			return lk.includes("token"); // include token-related fields only
		})
		.map(([k, v]) => ({
			key: k,
			label: toTitleCaseKey(k),
			value: Number(v),
		}));

	// De-duplicate legacy synonyms if both exist
	const map = new Map<
		string,
		{ key: string; label: string; value: number }
	>();
	for (const item of entries) {
		const lk = item.key.toLowerCase();
		let canonical = item.key;
		if (lk === "input_tokens") canonical = "input_text_tokens";
		if (lk === "output_tokens") canonical = "output_text_tokens";

		const prev = map.get(canonical);
		if (!prev || item.value > prev.value) {
			map.set(canonical, {
				key: canonical,
				label: toTitleCaseKey(canonical),
				value: item.value,
			});
		}
	}

	return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

function DialogHeaderSection({ selected }: { selected: SuccessfulRow | null }) {
	return (
		<div>
			<div className="px-5 py-4 sm:px-6 sm:py-5">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						{/* Title: generation id (request id) with copy button */}
						<DialogTitle className="flex items-center gap-3">
							<div className="text-lg font-semibold font-mono break-all">
								{selected?.request_id ?? "-"}
							</div>
							{selected?.request_id ? (
								<CopyButton
									size="sm"
									content={selected.request_id}
									aria-label="Copy generation id"
									className="ml-1"
								/>
							) : null}
						</DialogTitle>
						{/* Pill badges underneath: status, model, provider, time */}
						<div className="mt-2 flex flex-wrap items-center gap-2">
							{statusBadge(
								selected?.success,
								selected?.status_code
							)}
							{modelPill(selected?.model_id)}
							{providerPill(selected?.provider)}
							<Badge variant="outline" className="gap-1">
								<Clock className="h-3.5 w-3.5" />
								{formatHeaderTime(selected?.created_at)}
							</Badge>
						</div>
					</div>
					<div />
				</div>
			</div>
		</div>
	);
}

function TokenPieChart({ usage }: { usage: any }) {
	const data = React.useMemo(() => buildTokenBreakdown(usage), [usage]);
	const total = data.reduce((acc, d) => acc + d.value, 0);
	const palette = [
		"#60a5fa", // sky-400
		"#a78bfa", // violet-400
		"#34d399", // emerald-400
		"#fbbf24", // amber-400
		"#f472b6", // pink-400
		"#93c5fd", // blue-300
		"#fca5a5", // rose-300
		"#86efac", // green-300
		"#fcd34d", // amber-300
		"#c4b5fd", // violet-300
	];

	const config = React.useMemo(() => {
		const cfg: Record<string, { label: string; color: string }> = {};
		data.forEach((d, idx) => {
			cfg[d.label] = {
				label: d.label,
				color: palette[idx % palette.length],
			};
		});
		return cfg;
	}, [data]);

	if (data.length === 0) {
		return (
			<div className="text-sm text-muted-foreground">
				No token usage available.
			</div>
		);
	}

	return (
		<div className="flex items-center gap-4">
			<ChartContainer config={config} className="h-20 w-20">
				<PieChart startAngle={90} endAngle={-270}>
					<ChartTooltip
						content={<ChartTooltipContent nameKey="name" />}
					/>
					<Pie
						data={data.map((d, i) => ({
							...d,
							name: d.label,
							fill: palette[i % palette.length],
						}))}
						dataKey="value"
						nameKey="name"
						innerRadius={25}
						outerRadius={40}
						strokeWidth={2}
					>
						{data.map((_, i) => (
							<Cell
								key={`cell-${i}`}
								fill={palette[i % palette.length]}
							/>
						))}
					</Pie>
				</PieChart>
			</ChartContainer>
			<div className="grid grid-cols-1 gap-2 text-sm">
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground">Total</span>
					<span className="ml-auto font-mono">
						{Intl.NumberFormat().format(total)}
					</span>
				</div>
				{data.map((d, i) => {
					const pct =
						total > 0 ? ((d.value / total) * 100).toFixed(0) : "0";
					return (
						<div key={d.key} className="flex items-center gap-2">
							<span
								className="inline-block h-2.5 w-2.5 rounded-sm"
								style={{
									backgroundColor:
										palette[i % palette.length],
								}}
							/>
							<span className="text-muted-foreground">
								{d.label}
							</span>
							<span className="ml-auto font-mono">
								{Intl.NumberFormat().format(d.value)} ({pct}%)
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function OverviewTab({ selected }: { selected: SuccessfulRow | null }) {
	return (
		<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
			{/* Left: meta grid */}
			<div className="rounded-2xl border bg-card p-4">
				<div className="mb-3 text-sm font-medium">Request meta</div>
				<div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
					<div>
						<div className="text-xs text-muted-foreground">
							Model ID
						</div>
						<div className="font-medium">
							{selected?.model_id ?? "-"}
						</div>
					</div>
					<div>
						<div className="text-xs text-muted-foreground">
							Provider ID
						</div>
						<div className="font-medium">
							{selected?.provider ?? "-"}
						</div>
					</div>
					<div>
						<div className="text-xs text-muted-foreground">
							Status
						</div>
						<div className="font-medium">
							{statusBadge(
								selected?.success,
								selected?.status_code
							)}
						</div>
					</div>
					<div>
						<div className="text-xs text-muted-foreground">
							Time
						</div>
						<div className="font-medium">
							{selected ? niceDate(selected.created_at) : "-"}
						</div>
					</div>
				</div>

				<Separator className="my-4" />

				<TimingBar
					latency={
						Number(
							selected?.latency_ms ?? selected?.generation_ms ?? 0
						) || 0
					}
					generation={Number(selected?.generation_ms ?? 0) || 0}
				/>
			</div>

			{/* Right: spend & quick usage */}
			<div className="rounded-2xl border bg-card p-4">
				<div className="mb-3 text-sm font-medium">Spend & snapshot</div>
				<div className="grid grid-cols-2 gap-4 text-sm">
					<div>
						<div className="text-xs text-muted-foreground">
							Spend (USD)
						</div>
						<div className="font-mono text-lg font-semibold">
							${formatUSDFromNanos(selected?.cost_nanos)}
						</div>
					</div>
					<div>
						<div className="text-xs text-muted-foreground">
							Total tokens
						</div>
						<div className="font-mono text-lg font-semibold">
							{Intl.NumberFormat().format(
								getTokens(selected?.usage)
							)}
						</div>
					</div>
					<div>
						<div className="text-xs text-muted-foreground">
							Input tokens
						</div>
						<div className="font-mono">
							{Intl.NumberFormat().format(
								Number(
									selected?.usage?.input_text_tokens ??
										selected?.usage?.input_tokens ??
										0
								)
							)}
						</div>
					</div>
					<div>
						<div className="text-xs text-muted-foreground">
							Output tokens
						</div>
						<div className="font-mono">
							{Intl.NumberFormat().format(
								Number(
									selected?.usage?.output_text_tokens ??
										selected?.usage?.output_tokens ??
										0
								)
							)}
						</div>
					</div>
				</div>
				<Separator className="my-4" />
				<TokenPieChart usage={selected?.usage} />
			</div>
		</div>
	);
}

function UsageTab({ selected }: { selected: SuccessfulRow | null }) {
	return (
		<div className="grid grid-cols-1 gap-6 md:grid-cols-3">
			<div className="rounded-2xl border bg-card p-4 md:col-span-2">
				<div className="mb-3 text-sm font-medium">Token breakdown</div>
				<TokenPieChart usage={selected?.usage} />
			</div>
			<div className="rounded-2xl border bg-card p-4">
				<div className="mb-3 text-sm font-medium">Timings</div>
				<TimingBar
					latency={
						Number(
							selected?.latency_ms ?? selected?.generation_ms ?? 0
						) || 0
					}
					generation={Number(selected?.generation_ms ?? 0) || 0}
				/>
			</div>
		</div>
	);
}

function RawTab({ selected }: { selected: SuccessfulRow | null }) {
	return (
		<div className="rounded-2xl border bg-card">
			<div className="flex items-center justify-between px-4 py-3">
				<div className="text-sm font-medium">Raw payload</div>
				{selected ? (
					<CopyButton
						size="sm"
						variant="outline"
						content={JSON.stringify(selected, null, 2)}
						aria-label="Copy raw JSON"
					/>
				) : null}
			</div>
			<Separator />
			<div className="max-h-[50vh] overflow-auto p-4">
				<pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs leading-relaxed">
					{selected ? JSON.stringify(selected, null, 2) : ""}
				</pre>
			</div>
		</div>
	);
}

export default function SuccessfulRequestDialog({
	row,
	open,
	onOpenChange,
}: {
	row: SuccessfulRow | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const selected = row;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[900px] overflow-hidden p-0">
				<DialogHeaderSection selected={selected} />

				<div className="p-5 sm:p-6">
					{/* KPI tiles */}
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<MetricTile
							icon={<Coins className="h-4 w-4" />}
							label="Spend (USD)"
							value={
								<span className="font-mono">
									${formatUSDFromNanos(selected?.cost_nanos)}
								</span>
							}
							tone="amber"
						/>
						<MetricTile
							icon={<CaseUpper className="h-4 w-4" />}
							label="Total Tokens"
							value={
								<span className="font-mono">
									{Intl.NumberFormat().format(
										getTokens(selected?.usage)
									)}
								</span>
							}
							tone="violet"
						/>
						<MetricTile
							icon={<Gauge className="h-4 w-4" />}
							label="Generation time"
							value={
								<span className="font-mono">
									{Number(selected?.generation_ms ?? 0) ||
										"-"}{" "}
									ms
								</span>
							}
							tone="sky"
						/>
						<MetricTile
							icon={<Activity className="h-4 w-4" />}
							label="Latency (first token/byte)"
							value={
								<span className="font-mono">
									{Number(
										selected?.latency_ms ??
											selected?.generation_ms ??
											0
									) || "-"}{" "}
									ms
								</span>
							}
							tone="emerald"
						/>
					</div>

					<Separator className="my-5" />

					{/* Tabs */}
					<Tabs defaultValue="overview" className="w-full">
						<TabsList className="grid w-full grid-cols-3">
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<TabsTrigger value="usage">Usage</TabsTrigger>
							<TabsTrigger value="raw">Raw</TabsTrigger>
						</TabsList>

						{/* OVERVIEW */}
						<TabsContent value="overview" className="mt-4">
							<OverviewTab selected={selected} />
						</TabsContent>

						{/* USAGE */}
						<TabsContent value="usage" className="mt-4">
							<UsageTab selected={selected} />
						</TabsContent>

						{/* RAW */}
						<TabsContent value="raw" className="mt-4">
							<RawTab selected={selected} />
						</TabsContent>
					</Tabs>
				</div>

				<DialogFooter className="px-5 pb-5 sm:px-6">
					{/* Intentionally simple footer for future actions (e.g., “Open in Axiom”) */}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
