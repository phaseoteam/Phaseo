"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { KeyDetailData } from "@/lib/fetchers/internal/fetchSettingsKeyDetail";

const config = { requests: { label: "Requests", color: "var(--chart-1)" }, spendUsd: { label: "Spend (USD)", color: "var(--chart-2)" } };
const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(value);
const label = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: "UTC" });

export function KeyUsageCharts({ chart }: { chart: KeyDetailData["chart"] }) {
	if (chart === null) return <p className="rounded-xl border p-5 text-sm text-muted-foreground">Usage charts are temporarily unavailable.</p>;
	return <div className="space-y-3">
		<p className="text-xs text-muted-foreground">Past 30 days · Daily UTC buckets · Successful requests · Today is incomplete</p>
		{chart.points.every((point) => point.requests === 0) ? <p className="rounded-xl border p-5 text-sm text-muted-foreground">No successful requests in this period.</p> : <div className="grid gap-4 lg:grid-cols-2">
			<section className="min-w-0 rounded-xl border bg-card p-5"><h3 className="mb-4 text-sm font-medium">Requests</h3>
				<ChartContainer config={config} className="h-56 w-full"><BarChart accessibilityLayer data={chart.points} margin={{ left: 0, right: 8 }}>
					<CartesianGrid vertical={false} /><XAxis dataKey="date" tickFormatter={label} minTickGap={35} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} width={45} tickLine={false} axisLine={false} />
					<ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => `${value} UTC`} />} /><Bar dataKey="requests" fill="var(--color-requests)" radius={[3, 3, 0, 0]} />
				</BarChart></ChartContainer>
			</section>
			<section className="min-w-0 rounded-xl border bg-card p-5"><h3 className="mb-4 text-sm font-medium">Spend (USD)</h3>
				<ChartContainer config={config} className="h-56 w-full"><AreaChart accessibilityLayer data={chart.points} margin={{ left: 0, right: 8 }}>
					<CartesianGrid vertical={false} /><XAxis dataKey="date" tickFormatter={label} minTickGap={35} tickLine={false} axisLine={false} /><YAxis width={55} tickFormatter={usd} tickLine={false} axisLine={false} />
					<ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => `${value} UTC`} formatter={(value) => usd(Number(value))} />} /><Area type="linear" dataKey="spendUsd" stroke="var(--color-spendUsd)" fill="var(--color-spendUsd)" fillOpacity={0.15} />
				</AreaChart></ChartContainer>
			</section>
		</div>}
	</div>;
}
