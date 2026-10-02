"use client";

import { useLocale, useTranslations } from "next-intl";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { KeyDetailData } from "@/lib/fetchers/internal/fetchSettingsKeyDetail";

export function KeyUsageCharts({ chart }: { chart: KeyDetailData["chart"] }) {
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const config = { requests: { label: t("oauthDetail.requests"), color: "var(--chart-1)" }, spendUsd: { label: t("keyDetail.spendUsd"), color: "var(--chart-2)" } };
	const usd = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(value);
	const label = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
	if (chart === null) return <p className="rounded-xl border p-5 text-sm text-muted-foreground">{t("keyDetail.chartUnavailable")}</p>;
	return <div className="space-y-3">
		<p className="text-xs text-muted-foreground">{t("keyDetail.chartPeriod")}</p>
		{chart.points.every((point) => point.requests === 0) ? <p className="rounded-xl border p-5 text-sm text-muted-foreground">{t("keyDetail.noRequests")}</p> : <div className="grid gap-4 lg:grid-cols-2">
			<section className="min-w-0 rounded-xl border bg-card p-5"><h3 className="mb-4 text-sm font-medium">{t("oauthDetail.requests")}</h3>
				<ChartContainer config={config} className="h-56 w-full"><BarChart accessibilityLayer data={chart.points} margin={{ left: 0, right: 8 }}>
					<CartesianGrid vertical={false} /><XAxis dataKey="date" tickFormatter={label} minTickGap={35} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} width={45} tickLine={false} axisLine={false} />
					<ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => `${value} UTC`} />} /><Bar dataKey="requests" fill="var(--color-requests)" radius={[3, 3, 0, 0]} />
				</BarChart></ChartContainer>
			</section>
			<section className="min-w-0 rounded-xl border bg-card p-5"><h3 className="mb-4 text-sm font-medium">{t("keyDetail.spendUsd")}</h3>
				<ChartContainer config={config} className="h-56 w-full"><AreaChart accessibilityLayer data={chart.points} margin={{ left: 0, right: 8 }}>
					<CartesianGrid vertical={false} /><XAxis dataKey="date" tickFormatter={label} minTickGap={35} tickLine={false} axisLine={false} /><YAxis width={55} tickFormatter={usd} tickLine={false} axisLine={false} />
					<ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => `${value} UTC`} formatter={(value) => usd(Number(value))} />} /><Area type="linear" dataKey="spendUsd" stroke="var(--color-spendUsd)" fill="var(--color-spendUsd)" fillOpacity={0.15} />
				</AreaChart></ChartContainer>
			</section>
		</div>}
	</div>;
}
