import { Hono } from "hono";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

type StatusState = "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance" | "unknown";
type ProviderIncident = { id: string; title: string; link: string; status: string; impact?: string; description?: string; updatedAt?: string; publishedAt?: string };
type ProviderStatus = { name: string; statusPageUrl: string; hasIssues: boolean; incidents: ProviderIncident[]; lastChecked?: string; error?: string };

const STATUS_PAGE_HREF = "https://status.phaseo.app";
const DEFAULT_STATUS_PAGE_URL = "https://status.phaseo.app";
const DEFAULT_WIDGET_API_URL = "https://statuspage.incident.io/phaseo/api/v1/summary";
const VISIBLE_COMPONENT_NAMES = new Set([
	"API health (/v1/health)",
	"Models API (/v1/models)",
	"Generation API demo",
	"Homepage",
	"Docs page",
	"Documentation homepage",
]);

type ComponentStatus = {
	name: string;
	status: string;
	state: StatusState;
	label: string;
	parent: string | null;
};

type IncidentSummary = {
	affected_components?: unknown;
	components?: Array<{
		id?: unknown;
		name?: unknown;
		status?: unknown;
		component_status?: unknown;
	}>;
	in_progress_maintenances?: unknown;
	ongoing_incidents?: unknown;
	structure?: {
		items?: Array<{
			component?: unknown;
			group?: unknown;
		}>;
	};
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function normalizeStatus(value: unknown): { state: StatusState; label: string } {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return { state: "unknown", label: "Status unavailable" };
  if (["up", "operational", "all_systems_operational", "ok"].includes(normalized)) return { state: "operational", label: "All systems operational" };
  if (normalized === "hasissues") return { state: "degraded", label: "Service issues reported" };
  if (normalized.includes("maintenance")) return { state: "maintenance", label: "Under maintenance" };
  if (normalized.includes("major") || normalized === "down" || normalized === "full_outage") return { state: "major_outage", label: "Major outage" };
  if (normalized.includes("partial")) return { state: "partial_outage", label: "Partial outage" };
  if (normalized.includes("degraded")) return { state: "degraded", label: "Degraded performance" };
  return { state: "unknown", label: raw };
}

function displayComponentName(value: unknown) {
	return String(value ?? "")
		.trim()
		.replace(/\bAI\s+Stats\b/g, "Phaseo")
		.replace(/^Models API \(\/v1\/api\/models\)$/, "API Gateway");
}

function isVisibleComponent(component: ComponentStatus, components: ComponentStatus[]) {
	if (
		component.name === "API" &&
		component.parent === null &&
		components.some((candidate) => candidate.name.startsWith("API health ("))
	) {
		return false;
	}

	return (
		VISIBLE_COMPONENT_NAMES.has(component.name) ||
		component.name.startsWith("Landing page -")
	);
}

function extractEscapedObject(source: string, marker: string) {
	const start = source.indexOf(marker);
	if (start < 0) return null;

	const braceStart = source.indexOf("{", start + marker.length);
	if (braceStart < 0) return null;

	let depth = 0;
	for (let index = braceStart; index < source.length; index += 1) {
		const char = source[index];
		if (char === "{") {
			depth += 1;
			continue;
		}

		if (char !== "}") continue;
		depth -= 1;
		if (depth === 0) return source.slice(braceStart, index + 1);
	}

	return null;
}

function parseIncidentSummaryHtml(html: string): IncidentSummary {
	const rawSummary = extractEscapedObject(html, String.raw`\"summary\":`);
	if (!rawSummary) throw new Error("incident_summary_not_found");

	return JSON.parse(rawSummary.replace(/\\"/g, '"')) as IncidentSummary;
}

function affectedComponentKey(value: unknown) {
	if (!isRecord(value)) return null;
	const component = isRecord(value.component) ? value.component : value;
	const id =
		component.id ??
		component.component_id ??
		component.status_page_component_id ??
		value.component_id ??
		value.status_page_component_id;
	const name = component.name ?? value.name;

	return String(id ?? name ?? "").trim() || null;
}

function affectedComponentStatus(
	value: unknown,
	fallback?: { state: StatusState; label: string },
) {
	if (!isRecord(value)) return fallback ?? normalizeStatus(null);
	const status = normalizeStatus(
		value.current_status ??
			value.component_status ??
			value.status ??
			value.current_worst_impact ??
			(isRecord(value.component) ? value.component.status : null),
	);
	return status.state === "unknown" && fallback ? fallback : status;
}

const STATUS_SEVERITY: Record<StatusState, number> = {
	operational: 0,
	unknown: 1,
	maintenance: 2,
	degraded: 3,
	partial_outage: 4,
	major_outage: 5,
};

function setAffectedStatus(
	affected: Map<string, { state: StatusState; label: string }>,
	key: string,
	status: { state: StatusState; label: string },
) {
	const existing = affected.get(key);
	if (!existing || STATUS_SEVERITY[status.state] > STATUS_SEVERITY[existing.state]) {
		affected.set(key, status);
	}
}

function buildAffectedComponentMap(summary: IncidentSummary) {
	const affected = new Map<string, { state: StatusState; label: string }>();

	const addComponent = (
		component: unknown,
		fallback?: { state: StatusState; label: string },
	) => {
		const key = affectedComponentKey(component);
		if (!key) return;
		const status = affectedComponentStatus(component, fallback);
		if (status.state === "unknown") return;
		setAffectedStatus(affected, key, status);
	};

	for (const component of asArray(summary.affected_components)) {
		addComponent(component);
	}

	for (const event of asArray(summary.ongoing_incidents)) {
		if (!isRecord(event)) continue;
		const eventStatus = normalizeStatus(
			event.current_worst_impact ?? event.impact ?? event.status,
		);
		const fallback =
			eventStatus.state === "unknown"
				? normalizeStatus("degraded")
				: eventStatus;
		for (const component of asArray(event.affected_components)) {
			addComponent(component, fallback);
		}
	}

	for (const event of asArray(summary.in_progress_maintenances)) {
		if (!isRecord(event)) continue;
		for (const component of asArray(event.affected_components)) {
			addComponent(component, normalizeStatus("maintenance"));
		}
	}

	return affected;
}

function componentStatus(
	affected: Map<string, { state: StatusState; label: string }>,
	componentId: unknown,
	componentName: unknown,
) {
	const id = String(componentId ?? "").trim();
	const name = displayComponentName(componentName);
	return affected.get(id) ?? affected.get(name) ?? normalizeStatus("operational");
}

function flattenIncidentComponents(summary: IncidentSummary): ComponentStatus[] {
	const affected = buildAffectedComponentMap(summary);
	const components: ComponentStatus[] = [];

	for (const item of summary.structure?.items ?? []) {
		const group = isRecord(item.group) ? item.group : null;
		if (group && group.hidden !== true) {
			const parent = displayComponentName(group.name);
			for (const component of asArray(group.components)) {
				if (!isRecord(component) || component.hidden === true) continue;
				const name = displayComponentName(component.name);
				if (!name) continue;
				const status = componentStatus(
					affected,
					component.component_id,
					component.name,
				);
				components.push({ name, status: status.state, ...status, parent: parent || null });
			}
			continue;
		}

		const component = isRecord(item.component) ? item.component : null;
		if (!component || component.hidden === true) continue;
		const name = displayComponentName(component.name);
		if (!name) continue;
		const status = componentStatus(affected, component.component_id, component.name);
		components.push({ name, status: status.state, ...status, parent: null });
	}

	if (components.length > 0) return components.slice(0, 24);

	return (summary.components ?? []).flatMap((component) => {
		const name = displayComponentName(component.name);
		if (!name) return [];
		const status = componentStatus(affected, component.id, component.name);
		return [{ name, status: status.state, ...status, parent: null }];
	}).slice(0, 24);
}

function pickIncidentStatus(summary: IncidentSummary) {
	const affectedStatuses = Array.from(buildAffectedComponentMap(summary).values());
	if (affectedStatuses.length > 0) {
		return affectedStatuses.sort(
			(a, b) => STATUS_SEVERITY[b.state] - STATUS_SEVERITY[a.state],
		)[0];
	}

	if (asArray(summary.ongoing_incidents).length > 0) {
		return { state: "degraded" as const, label: "Service issues reported" };
	}

	if (asArray(summary.in_progress_maintenances).length > 0) {
		return normalizeStatus("maintenance");
	}

	return normalizeStatus("operational");
}

async function fetchIncidentStatus(signal: AbortSignal, env: Env) {
	const widgetApiUrl =
		env.STATUS_PAGE_WIDGET_API_URL?.trim() || DEFAULT_WIDGET_API_URL;
	const statusPageUrl =
		env.STATUS_PAGE_URL?.trim() || DEFAULT_STATUS_PAGE_URL;
	const [widgetResult, pageResult] = await Promise.allSettled([
		fetch(widgetApiUrl, {
			headers: { accept: "application/json" },
			signal,
		}),
		fetch(statusPageUrl, {
			headers: { accept: "text/html" },
			signal,
		}),
	]);

	let widgetSummary: IncidentSummary | null = null;
	if (widgetResult.status === "fulfilled" && widgetResult.value.ok) {
		widgetSummary = (await widgetResult.value.json()) as IncidentSummary;
	}

	let pageSummary: IncidentSummary | null = null;
	if (pageResult.status === "fulfilled" && pageResult.value.ok) {
		try {
			pageSummary = parseIncidentSummaryHtml(await pageResult.value.text());
		} catch {
			pageSummary = null;
		}
	}

	const liveSummary = widgetSummary ?? pageSummary;
	const structureSummary = pageSummary ?? widgetSummary;
	if (!liveSummary || !structureSummary) throw new Error("status_page_unavailable");

	const summary: IncidentSummary = {
		...structureSummary,
		affected_components:
			widgetSummary?.affected_components ?? structureSummary.affected_components,
		in_progress_maintenances:
			widgetSummary?.in_progress_maintenances ??
			structureSummary.in_progress_maintenances,
		ongoing_incidents:
			widgetSummary?.ongoing_incidents ?? structureSummary.ongoing_incidents,
	};

	return {
		components: flattenIncidentComponents(summary),
		href: STATUS_PAGE_HREF,
		status: pickIncidentStatus(liveSummary),
	};
}

export const publicStatusRouter = new Hono<{ Bindings: Env }>();

publicStatusRouter.get("/status", async (c) => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 3500);
	try {
		const { components, href, status } = await fetchIncidentStatus(controller.signal, c.env);
		const visibleComponents = components.filter((component) => isVisibleComponent(component, components));
		const componentIssues = visibleComponents.filter((component) => component.state !== "operational" && component.state !== "unknown");
		const onlyThirdPartyIssues = componentIssues.length > 0 && componentIssues.every((component) => `${component.name} ${component.parent ?? ""}`.includes("Third Party:"));
		const label = status.state === "operational"
			? status.label
			: onlyThirdPartyIssues
				? "Slightly degraded"
				: componentIssues.length > 1
					? `${componentIssues.length} services affected`
					: status.label;

		return withPublicCache(c.json({ ok: true, ...status, label, components: visibleComponents, href }), { edgeTtlSeconds: 30, staleWhileRevalidateSeconds: 60 });
	} catch {
		return c.json({ ok: false, state: "unknown" satisfies StatusState, label: "Status unavailable", components: [], href: STATUS_PAGE_HREF });
	} finally {
		clearTimeout(timeout);
	}
});

const resolvedProviderStatuses = new Set(["resolved", "operational"]);
const normalizeProviderStatus = (value: unknown) => String(value ?? "").trim().toLowerCase();
const XML_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	"#39": "'",
	apos: "'",
};
const decodeXml = (value: string) => value
	.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
	.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_match, entity: string) => XML_ENTITIES[entity] ?? _match);
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
