type Row = Record<string, unknown>;

function row(value: unknown): Row | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}

function rows(value: unknown): Row[] {
	return Array.isArray(value) ? value.map(row).filter((item): item is Row => item !== null) : [];
}

function number(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function average(values: Array<number | null>): number | null {
	const present = values.filter((value): value is number => value !== null);
	return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

export function composeCompareUsage(sourceRows: Row[]) {
	return Object.fromEntries(sourceRows.flatMap((source) => {
		const modelId = String(source.model_id ?? "").trim();
		if (!modelId) return [];
		const performance = row(source.performance);
		const trajectory = row(source.trajectory);
		const summary = row(performance?.last_24h);
		const hourly = rows(performance?.hourly_24h);
		const timeOfDay = rows(performance?.time_of_day_5d);
		const providers = rows(performance?.provider_uptime_24h);
		const cumulative = row(performance?.cumulative_tokens);
		const points30d = rows(trajectory?.points).slice(-30).map((point) => ({
			date: String(point.date ?? ""),
			value: number(point.tokens) ?? 0,
		}));
		const latencyFallback = number(summary?.avg_latency_ms)
			?? average(hourly.map((item) => number(item.avg_latency_ms)))
			?? average(timeOfDay.map((item) => number(item.avg_latency_ms)))
			?? average(providers.map((item) => number(item.avg_latency_ms)));
		const throughputFallback = number(summary?.avg_throughput)
			?? average(hourly.map((item) => number(item.avg_throughput)))
			?? average(timeOfDay.map((item) => number(item.avg_throughput)))
			?? average(providers.map((item) => number(item.avg_throughput)));
		return [[modelId, {
			periodDays: 30,
			tokens30d: points30d.reduce((sum, point) => sum + point.value, 0),
			latestDate: points30d.at(-1)?.date || null,
			points30d,
			totalRequests: number(summary?.total_requests) ?? 0,
			requests30m: number(source.realtime_requests) ?? 0,
			latencyP50Ms30m: number(source.realtime_latency_p50) ?? latencyFallback,
			throughputP50TokPerSec30m: number(source.realtime_throughput_p50) ?? throughputFallback,
			cumulativeTokens: number(cumulative?.total_tokens),
			requestPoints24h: hourly.map((point) => ({ date: String(point.bucket ?? ""), value: number(point.requests) ?? 0 })),
		}]];
	}));
}
