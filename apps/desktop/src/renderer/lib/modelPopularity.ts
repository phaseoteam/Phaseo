import { useEffect, useState } from "react";

type WeeklyMetrics = { metrics?: { model_slug?: unknown; popularity_tokens_week?: unknown }[] };

/**
 * Each Phaseo model's tokens over the past week, from the public, cached catalogue endpoint the website and phone app
 * rank models by (about 2 KB). Loaded once a session; a failure leaves the order to the model counts and tries again later.
 */
let pending: Promise<Map<string, number>> | undefined;
const load = () => pending ??= fetch("https://phaseo.app/api/_web/models/weekly-metrics")
	.then(response => response.ok ? response.json() as Promise<WeeklyMetrics> : { metrics: [] })
	.then(body => new Map((body.metrics ?? []).flatMap(row => typeof row.model_slug === "string" && typeof row.popularity_tokens_week === "number" && row.popularity_tokens_week > 0 ? [[row.model_slug, row.popularity_tokens_week] as const] : [])))
	.catch(() => { pending = undefined; return new Map<string, number>(); });

export function useModelPopularity(enabled: boolean) {
	const [popularity, setPopularity] = useState<Map<string, number>>();
	useEffect(() => {
		if (!enabled) return;
		let current = true;
		void load().then(value => { if (current) setPopularity(value); });
		return () => { current = false; };
	}, [enabled]);
	return popularity;
}
