import { expect, it } from "vitest";
import { googleIncidents, providerIncidents, statuspageIncidents } from "./providerStatus";

it("reads open Statuspage incidents, or the page's overall state when it names none", () => {
	expect(statuspageIncidents("anthropic", { status: { indicator: "none" }, incidents: [] })).toEqual([]);
	expect(statuspageIncidents("anthropic", { status: { indicator: "major" }, incidents: [{ name: "Elevated errors on Claude Opus", impact: "major", status: "investigating", updated_at: "2026-11-05T09:00:00Z" }, { name: "Old", impact: "minor", status: "resolved" }] }))
		.toEqual([{ id: "anthropic", title: "Elevated errors on Claude Opus", severity: "major", updatedAt: "2026-11-05T09:00:00Z" }]);
	expect(statuspageIncidents("openai", { status: { indicator: "minor", description: "Partially Degraded Service" }, incidents: [] })).toEqual([{ id: "openai", title: "Partially Degraded Service", severity: "minor" }]);
});

it("keeps only Google's open incidents that touch Gemini or Vertex AI", () => {
	expect(googleIncidents([
		{ end: null, external_desc: "Gemini API errors", severity: "high", affected_products: [{ title: "Vertex Gemini API" }] },
		{ end: null, external_desc: "BigQuery slow", severity: "medium", affected_products: [{ title: "BigQuery" }] },
		{ end: "2026-10-20T12:08:00+00:00", external_desc: "Fixed", affected_products: [{ title: "Vertex AI" }] },
	])).toEqual([{ id: "google", title: "Gemini API errors", severity: "major" }]);
});

it("treats a page it can't read as quiet", async () => {
	const fetcher = (async (url: string) => url.includes("anthropic") ? new Response(JSON.stringify({ status: { indicator: "critical", description: "Major outage" }, incidents: [] })) : new Response("<html>", { status: 503 })) as unknown as typeof fetch;
	expect(await providerIncidents(fetcher)).toEqual([{ id: "anthropic", title: "Major outage", severity: "critical" }]);
});
