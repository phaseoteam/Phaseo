"use client";

import { useTranslations } from "next-intl";
import { ForecastMeter } from "@/components/(gateway)/usage/ForecastMeter";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import type { KeyDetailData } from "@/lib/fetchers/internal/fetchSettingsKeyDetail";
import { forecastLimitWindow, formatLimitResetCountdown, type LimitWindow } from "@/lib/gateway/usage/limitForecast";

type KeyLimits = Pick<
	KeyDetailData["key"],
	| "daily_limit_requests"
	| "weekly_limit_requests"
	| "monthly_limit_requests"
	| "daily_limit_cost_nanos"
	| "weekly_limit_cost_nanos"
	| "monthly_limit_cost_nanos"
>;

const PERIODS = [
	{ prefix: "daily", window: "day", label: "labels.today" },
	{ prefix: "weekly", window: "week", label: "labels.thisWeek" },
	{ prefix: "monthly", window: "month", label: "labels.thisMonth" },
] as const satisfies ReadonlyArray<{ prefix: string; window: LimitWindow; label: string }>;

export function KeyUsageSummary({
	usage,
	limits,
	observedAt,
}: {
	usage: KeyDetailData["usage"];
	limits: KeyLimits;
	/** Server time the usage was read, so projections match between render and hydration. */
	observedAt: number;
}) {
	const t = useTranslations("SettingsUI");
	const format = useDisplayFormatters();
	if (usage === null) return <p className="text-sm text-muted-foreground">{t("keyDetail.usageUnavailable")}</p>;

	const usd = (nanos: number) => {
		const value = nanos / 1e9;
		return format.number(value, {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 2,
			maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
			notation: "standard",
		});
	};

	return <div className="grid gap-4 md:grid-cols-3">
		{PERIODS.map((period) => {
			const spent = Number(usage[`${period.prefix}_cost_nanos`] ?? 0) || 0;
			const requests = Number(usage[`${period.prefix}_request_count`] ?? 0) || 0;
			const spendLimit = Number(limits[`${period.prefix}_limit_cost_nanos`] ?? 0) || 0;
			const requestLimit = Number(limits[`${period.prefix}_limit_requests`] ?? 0) || 0;
			const spendForecast = forecastLimitWindow({ window: period.window, used: spent, limit: spendLimit, now: observedAt });
			const requestForecast = requestLimit > 0
				? forecastLimitWindow({ window: period.window, used: requests, limit: requestLimit, now: observedAt })
				: null;
			const when = (at: number) => format.dateParts(
				at,
				period.window === "day" ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" },
			);
			const spendProjection = spendForecast && spendForecast.projected > spent ? spendForecast : null;
			const spendLabel = [
				`${t(period.label)}: ${usd(spent)}`,
				spendLimit > 0 ? t("keyDetail.ofLimit", { limit: usd(spendLimit) }) : null,
				spendProjection ? t("keyDetail.onPaceFor", { amount: usd(spendProjection.projected) }) : null,
			].filter(Boolean).join(", ");
			const requestLabel = [
				t("keyDetail.requestsOfLimit", { count: format.number(requests), limit: format.number(requestLimit) }),
				requestForecast && requestForecast.projected > requests
					? t("keyDetail.onPaceFor", { amount: format.number(Math.round(requestForecast.projected)) })
					: null,
			].filter(Boolean).join(", ");

			return <div key={period.prefix} className="rounded-xl border bg-card p-5">
				<div className="flex items-baseline justify-between gap-3">
					<h3 className="text-sm font-medium text-muted-foreground">{t(period.label)}</h3>
					<span className="text-xs tabular-nums text-muted-foreground">
						{t("strings.Resets in {time}" as never, { time: formatLimitResetCountdown(period.window, observedAt) } as never)}
					</span>
				</div>
				<p className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
					<span className="text-2xl font-semibold tracking-tight tabular-nums">{usd(spent)}</span>
					{spendLimit > 0 ? <span className="text-sm tabular-nums text-muted-foreground">{t("keyDetail.ofLimit", { limit: usd(spendLimit) })}</span> : null}
				</p>
				{spendLimit > 0 || spendProjection ? (
					<ForecastMeter className="mt-3" used={spent} projected={spendProjection?.projected} limit={spendLimit} label={spendLabel} />
				) : null}
				{spendProjection ? (
					<div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs tabular-nums">
						<span className="text-muted-foreground">{t("keyDetail.onPaceFor", { amount: usd(spendProjection.projected) })}</span>
						{spendProjection.reachesLimitAt !== null ? (
							<span className="text-amber-700 dark:text-amber-300">{t("keyDetail.reachesLimit", { date: when(spendProjection.reachesLimitAt) })}</span>
						) : null}
					</div>
				) : null}
				<div className="mt-4 border-t pt-3">
					<p className="text-sm tabular-nums text-muted-foreground">
						{requestLimit > 0
							? t("keyDetail.requestsOfLimit", { count: format.number(requests), limit: format.number(requestLimit) })
							: `${format.number(requests)} ${t("strings.requests")}`}
					</p>
					{requestLimit > 0 ? (
						<ForecastMeter className="mt-2" used={requests} projected={requestForecast?.projected} limit={requestLimit} label={requestLabel} />
					) : null}
					{requestForecast?.reachesLimitAt != null ? (
						<p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">{t("keyDetail.reachesLimit", { date: when(requestForecast.reachesLimitAt) })}</p>
					) : null}
				</div>
			</div>;
		})}
	</div>;
}
