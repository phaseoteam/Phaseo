export type KeyUsagePoint = { date: string; requests: number; spendUsd: number };

export function keyUsageSeries(rows: Array<{ bucket?: unknown; requests?: unknown; cost?: unknown }>, from: string, to: string): KeyUsagePoint[] {
	const days = new Map<string, KeyUsagePoint>();
	const start = Date.parse(from.slice(0, 10));
	const end = Date.parse(to.slice(0, 10));
	for (let day = start; day <= end; day += 86_400_000) {
		const date = new Date(day).toISOString().slice(0, 10);
		days.set(date, { date, requests: 0, spendUsd: 0 });
	}
	for (const row of rows) {
		if (typeof row.bucket !== "string") continue;
		const point = days.get(row.bucket.slice(0, 10));
		if (!point) continue;
		const requests = Number(row.requests ?? 0), cost = Number(row.cost ?? 0);
		if (!Number.isFinite(requests) || !Number.isFinite(cost)) throw new Error("invalid_usage_rollup");
		point.requests += requests;
		point.spendUsd += cost;
	}
	return Array.from(days.values());
}
