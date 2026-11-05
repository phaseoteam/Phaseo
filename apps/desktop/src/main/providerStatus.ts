import type { ProviderIncident, ProviderStatusId } from "../shared/providerStatus";

/** Public status pages, read only for their summaries; no request carries anything about the person. */
export const statusSources: Record<ProviderStatusId, { label: string; summary: string; page: string; kind: "statuspage" | "google" }> = {
	phaseo: { label: "Phaseo", summary: "https://status.phaseo.app/api/v2/summary.json", page: "https://status.phaseo.app/", kind: "statuspage" },
	anthropic: { label: "Anthropic", summary: "https://status.anthropic.com/api/v2/summary.json", page: "https://status.claude.com/", kind: "statuspage" },
	openai: { label: "OpenAI", summary: "https://status.openai.com/api/v2/summary.json", page: "https://status.openai.com/", kind: "statuspage" },
	cursor: { label: "Cursor", summary: "https://status.cursor.com/api/v2/summary.json", page: "https://status.cursor.com/", kind: "statuspage" },
	google: { label: "Google Cloud", summary: "https://status.cloud.google.com/incidents.json", page: "https://status.cloud.google.com/", kind: "google" },
};

const severity = (value: unknown): ProviderIncident["severity"] | undefined => value === "critical" || value === "major" || value === "minor" ? value : value === "high" ? "major" : value === "medium" || value === "low" ? "minor" : undefined;

/** The open incidents in one Statuspage summary, or its overall state when it names none. */
export function statuspageIncidents(id: ProviderStatusId, value: unknown): ProviderIncident[] {
	const summary = value as { status?: { indicator?: unknown; description?: unknown }; incidents?: { name?: unknown; impact?: unknown; status?: unknown; shortlink?: unknown; updated_at?: unknown }[] };
	const open = (summary.incidents ?? []).filter(incident => incident && incident.status !== "resolved" && incident.status !== "postmortem" && typeof incident.name === "string");
	if (open.length) return open.slice(0, 3).map(incident => ({ id, title: String(incident.name).slice(0, 200), severity: severity(incident.impact) ?? "minor", ...(typeof incident.updated_at === "string" ? { updatedAt: incident.updated_at } : {}) }));
	const overall = severity(summary.status?.indicator);
	return overall ? [{ id, title: typeof summary.status?.description === "string" ? summary.status.description.slice(0, 200) : "Degraded service", severity: overall }] : [];
}

/** Google's open incidents that touch Gemini or Vertex AI, the services Phaseo and Gemini agents call. */
export function googleIncidents(value: unknown): ProviderIncident[] {
	if (!Array.isArray(value)) return [];
	return value.filter(incident => incident && !incident.end && Array.isArray(incident.affected_products) && incident.affected_products.some((product: { title?: unknown }) => /gemini|vertex ai/i.test(String(product?.title ?? ""))))
		.slice(0, 3).map(incident => ({ id: "google" as const, title: String(incident.external_desc ?? "Google Cloud incident").slice(0, 200), severity: severity(incident.severity) ?? "minor", ...(typeof incident.modified === "string" ? { updatedAt: incident.modified } : {}) }));
}

let cached: { at: number; incidents: ProviderIncident[] } | undefined, pending: Promise<ProviderIncident[]> | undefined;
/** Every source's open incidents, read at most every five minutes; a page that can't be read counts as quiet. */
export function providerIncidents(fetcher: typeof fetch = fetch, now = Date.now()): Promise<ProviderIncident[]> {
	if (cached && now - cached.at < 5 * 60_000) return Promise.resolve(cached.incidents);
	pending ??= Promise.all((Object.entries(statusSources) as [ProviderStatusId, typeof statusSources[ProviderStatusId]][]).map(async ([id, source]) => {
		try {
			const response = await fetcher(source.summary, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } });
			if (!response.ok) return [];
			const body: unknown = await response.json();
			return source.kind === "google" ? googleIncidents(body) : statuspageIncidents(id, body);
		} catch { return []; }
	})).then(lists => { const incidents = lists.flat(); cached = { at: Date.now(), incidents }; return incidents; }).finally(() => { pending = undefined; });
	return pending;
}
