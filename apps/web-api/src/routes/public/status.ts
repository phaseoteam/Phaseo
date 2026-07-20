import { Hono } from "hono";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

type StatusState = "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance" | "unknown";
type InstatusComponent = { name?: unknown; status?: unknown; children?: InstatusComponent[] };
type ProviderIncident = { id: string; title: string; link: string; status: string; impact?: string; description?: string; updatedAt?: string; publishedAt?: string };
type ProviderStatus = { name: string; statusPageUrl: string; hasIssues: boolean; incidents: ProviderIncident[]; lastChecked?: string; error?: string };

const STATUS_PAGE_HREF = "https://phaseo.instatus.com/";
const DEFAULT_SUMMARY_URL = "https://phaseo.instatus.com/api/v2/summary.json";
const DEFAULT_COMPONENTS_URL = "https://phaseo.instatus.com/api/v2/components.json";

function normalizeStatus(value: unknown): { state: StatusState; label: string } {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return { state: "unknown", label: "Status unavailable" };
  if (["up", "operational", "all_systems_operational"].includes(normalized)) return { state: "operational", label: "All systems operational" };
  if (normalized === "hasissues" || normalized.includes("degraded")) return { state: "degraded", label: "Service issues reported" };
  if (normalized.includes("maintenance")) return { state: "maintenance", label: "Under maintenance" };
  if (normalized.includes("major") || normalized === "down") return { state: "major_outage", label: "Major outage" };
  if (normalized.includes("partial")) return { state: "partial_outage", label: "Partial outage" };
  return { state: "unknown", label: raw };
}

function statusFromSummary(payload: unknown) {
  const data = payload as { page?: { status?: unknown }; status?: { description?: unknown; indicator?: unknown } };
  return normalizeStatus(data.page?.status ?? data.status?.description ?? data.status?.indicator);
}

function flattenComponents(components: InstatusComponent[] | undefined, parent: string | null = null): Array<{ name: string; status: string; state: StatusState; label: string; parent: string | null }> {
  if (!Array.isArray(components)) return [];
  return components.flatMap((component) => {
    const name = String(component.name ?? "").trim().replace(/\bAI\s+Stats\b/g, "Phaseo").replace(/^Models API \(\/v1\/api\/models\)$/, "API Gateway");
    const status = normalizeStatus(component.status);
    const current = name ? [{ name, status: String(component.status ?? ""), ...status, parent }] : [];
    const childParent = name ? (parent ? `${parent} / ${name}` : name) : parent;
    return [...current, ...flattenComponents(component.children, childParent)];
  });
}

function withCacheBuster(value: string) {
  const url = new URL(value);
  url.searchParams.set("_", Date.now().toString());
  return url.toString();
}

export const publicStatusRouter = new Hono<{ Bindings: Env }>();

publicStatusRouter.get("/status", async (c) => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 3500);
	try {
		const [summaryResult, componentsResult] = await Promise.allSettled([
			fetch(withCacheBuster(c.env.STATUS_PAGE_SUMMARY_URL?.trim() || DEFAULT_SUMMARY_URL), { headers: { accept: "application/json" }, signal: controller.signal }),
			fetch(withCacheBuster(c.env.STATUS_PAGE_COMPONENTS_URL?.trim() || DEFAULT_COMPONENTS_URL), { headers: { accept: "application/json" }, signal: controller.signal }),
		]);
		if (summaryResult.status === "rejected" || !summaryResult.value.ok) throw new Error("status_summary_unavailable");
		const status = statusFromSummary(await summaryResult.value.json());
		const components = componentsResult.status === "fulfilled" && componentsResult.value.ok
			? flattenComponents((await componentsResult.value.json() as { components?: InstatusComponent[] }).components).slice(0, 24)
			: [];
		return withPublicCache(c.json({ ok: true, ...status, components, href: STATUS_PAGE_HREF }), { edgeTtlSeconds: 30, staleWhileRevalidateSeconds: 60 });
	} catch {
		return c.json({ ok: false, state: "unknown" satisfies StatusState, label: "Status unavailable", components: [], href: STATUS_PAGE_HREF });
	} finally {
		clearTimeout(timeout);
	}
});

const resolvedProviderStatuses = new Set(["resolved", "operational"]);
const normalizeProviderStatus = (value: unknown) => String(value ?? "").trim().toLowerCase();
const decodeXml = (value: string) => value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
const xmlValue = (item: string, tag: string) => decodeXml(item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]?.trim() ?? "");

function rssIncidents(xml: string): ProviderIncident[] {
	return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match, index) => {
		const item = match[1] ?? "";
		const description = xmlValue(item, "description") || xmlValue(item, "content:encoded") || undefined;
		const status = normalizeProviderStatus(xmlValue(item, "cb:status") || description?.match(/Status:\s*([^<\n]+)/i)?.[1]);
		return {
			id: xmlValue(item, "guid") || xmlValue(item, "link") || `incident-${index}`,
			title: xmlValue(item, "title") || "Status update",
			link: xmlValue(item, "link"),
			status,
			impact: xmlValue(item, "cb:impact") || description?.match(/<p>Severity:\s*([^<]+)<\/p>/i)?.[1],
			description,
			publishedAt: xmlValue(item, "pubDate") || xmlValue(item, "dc:date") || undefined,
		};
	}).filter((incident) => incident.status && !resolvedProviderStatuses.has(incident.status));
}

async function fetchRssProvider(name: string, statusPageUrl: string, feedUrl: string): Promise<ProviderStatus> {
	try {
		const response = await fetch(feedUrl, { headers: { accept: "application/rss+xml, application/xml, text/xml" } });
		if (!response.ok) throw new Error(`Feed request failed (${response.status})`);
		const incidents = rssIncidents(await response.text());
		return { name, statusPageUrl, hasIssues: incidents.length > 0, incidents, lastChecked: new Date().toISOString() };
	} catch (error) {
		return { name, statusPageUrl, hasIssues: true, incidents: [], error: error instanceof Error ? error.message : "Unknown error" };
	}
}

async function fetchAnthropicProvider(): Promise<ProviderStatus> {
	const name = "Anthropic";
	const statusPageUrl = "https://status.claude.com/";
	try {
		const response = await fetch("https://status.claude.com/api/v2/summary.json", { headers: { accept: "application/json" } });
		if (!response.ok) throw new Error(`Feed request failed (${response.status})`);
		const payload = await response.json() as { incidents?: Array<Record<string, any>> };
		const incidents = (payload.incidents ?? []).map((incident) => ({
			id: String(incident.id ?? ""), title: String(incident.name ?? "Status update"), link: String(incident.shortlink ?? ""),
			status: normalizeProviderStatus(incident.status), impact: incident.impact, description: incident.incident_updates?.[0]?.body,
			updatedAt: incident.updated_at, publishedAt: incident.created_at,
		})).filter((incident) => incident.status && !resolvedProviderStatuses.has(incident.status));
		return { name, statusPageUrl, hasIssues: incidents.length > 0, incidents, lastChecked: new Date().toISOString() };
	} catch (error) {
		return { name, statusPageUrl, hasIssues: true, incidents: [], error: error instanceof Error ? error.message : "Unknown error" };
	}
}

publicStatusRouter.get("/status/providers", async (c) => {
	const providers = await Promise.all([
		fetchRssProvider("OpenAI", "https://status.openai.com/", "https://status.openai.com/feed.rss"),
		fetchAnthropicProvider(),
		fetchRssProvider("SpaceXAI", "https://status.x.ai/", "https://status.x.ai/feed.xml"),
	]);
	return withPublicCache(c.json({ providers }), { edgeTtlSeconds: 600, staleWhileRevalidateSeconds: 600 });
});
