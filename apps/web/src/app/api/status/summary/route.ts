import { NextResponse } from "next/server";

type StatusState =
	| "operational"
	| "degraded"
	| "partial_outage"
	| "major_outage"
	| "maintenance"
	| "unknown";

const STATUS_PAGE_HREF = "https://statuspage.incident.io/phaseo";
const DEFAULT_STATUS_PAGE_URL = "https://statuspage.incident.io/phaseo";
const DEFAULT_WIDGET_API_URL =
	"https://statuspage.incident.io/phaseo/api/v1/summary";
const STATUS_PAGE_CACHE_TTL_MS = 30_000;
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

type IncidentComponent = {
	component_id?: unknown;
	data_available_since?: unknown;
	display_uptime?: unknown;
	hidden?: unknown;
	name?: unknown;
	status?: unknown;
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
	page_title?: unknown;
	page_url?: unknown;
	public_url?: unknown;
	scheduled_maintenances?: unknown;
	structure?: {
		items?: Array<{
			component?: unknown;
			group?: unknown;
		}>;
	};
};

type CachedStatusSummary = {
	expiresAt: number;
	value: {
		components: ComponentStatus[];
		href: string;
		status: { state: StatusState; label: string };
	};
};

let cachedSummary: CachedStatusSummary | null = null;

function displayComponentName(value: unknown) {
	return String(value ?? "")
		.trim()
		.replace(/\bAI\s+Stats\b/g, "Phaseo")
		.replace(/^Models API \(\/v1\/api\/models\)$/, "API Gateway");
}

function isThirdPartyComponent(component: ComponentStatus) {
	return `${component.name} ${component.parent ?? ""}`.includes("Third Party:");
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

function normalizeStatus(value: unknown): { state: StatusState; label: string } {
	const raw = String(value ?? "").trim();
	const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");

	if (!normalized) {
		return { state: "unknown", label: "Status unavailable" };
	}

	if (
		normalized === "up" ||
		normalized === "operational" ||
		normalized === "all_systems_operational" ||
		normalized === "ok"
	) {
		return { state: "operational", label: "All systems operational" };
	}

	if (normalized === "hasissues") {
		return { state: "degraded", label: "Service issues reported" };
	}

	if (
		normalized.includes("maintenance") ||
		normalized === "under_maintenance" ||
		normalized === "maintenance_in_progress" ||
		normalized === "maintenance_scheduled"
	) {
		return { state: "maintenance", label: "Under maintenance" };
	}

	if (
		normalized.includes("major") ||
		normalized === "down" ||
		normalized === "major_outage" ||
		normalized === "full_outage"
	) {
		return { state: "major_outage", label: "Major outage" };
	}

	if (normalized.includes("partial") || normalized === "partial_outage") {
		return { state: "partial_outage", label: "Partial outage" };
	}

	if (normalized.includes("degraded") || normalized === "degraded_performance") {
		return { state: "degraded", label: "Degraded performance" };
	}

	return { state: "unknown", label: raw };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isIncidentComponent(value: unknown): value is IncidentComponent {
	return isRecord(value);
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
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
	if (!rawSummary) {
		throw new Error("incident_summary_not_found");
	}

	const decodedSummary = rawSummary.replace(/\\"/g, '"');
	return JSON.parse(decodedSummary) as IncidentSummary;
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
		affected.set(key, status);
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
	const status = affected.get(id) ?? affected.get(name);
	return status ?? normalizeStatus("operational");
}

function flattenIncidentComponents(summary: IncidentSummary): ComponentStatus[] {
	const affected = buildAffectedComponentMap(summary);
	const components: ComponentStatus[] = [];

	for (const item of summary.structure?.items ?? []) {
		const group = isRecord(item.group) ? item.group : null;
		if (group && group.hidden !== true) {
			const parent = displayComponentName(group.name);
			for (const component of asArray(group.components)) {
				if (!isIncidentComponent(component)) continue;
				if (component.hidden === true) continue;
				const name = displayComponentName(component.name);
				if (!name) continue;
				const status = componentStatus(
					affected,
					component.component_id,
					component.name,
				);
				components.push({
					name,
					status: status.state,
					state: status.state,
					label: status.label,
					parent: parent || null,
				});
			}
			continue;
		}

		const component = isIncidentComponent(item.component) ? item.component : null;
		if (!component || component.hidden === true) continue;
		const name = displayComponentName(component.name);
		if (!name) continue;
		const status = componentStatus(affected, component.component_id, component.name);
		components.push({
			name,
			status: status.state,
			state: status.state,
			label: status.label,
			parent: null,
		});
	}

	if (components.length > 0) return components.slice(0, 24);

	const fallbackComponents: ComponentStatus[] = [];
	for (const component of summary.components ?? []) {
		const name = displayComponentName(component.name);
		if (!name) continue;
		const status = componentStatus(affected, component.id, component.name);
		fallbackComponents.push({
			name,
			status: status.state,
			state: status.state,
			label: status.label,
			parent: null,
		});
	}

	return fallbackComponents.slice(0, 24);
}

function pickIncidentStatus(summary: IncidentSummary) {
	if (asArray(summary.in_progress_maintenances).length > 0) {
		return normalizeStatus("maintenance");
	}

	const affectedStatuses = Array.from(buildAffectedComponentMap(summary).values());
	if (affectedStatuses.length > 0) {
		const rank: Record<StatusState, number> = {
			operational: 0,
			unknown: 1,
			maintenance: 2,
			degraded: 3,
			partial_outage: 4,
			major_outage: 5,
		};
		return affectedStatuses.sort((a, b) => rank[b.state] - rank[a.state])[0];
	}

	if (asArray(summary.ongoing_incidents).length > 0) {
		return { state: "degraded" as const, label: "Service issues reported" };
	}

	return normalizeStatus("operational");
}

async function fetchIncidentStatus(signal: AbortSignal) {
	if (cachedSummary && cachedSummary.expiresAt > Date.now()) {
		return cachedSummary.value;
	}

	const widgetApiUrl =
		process.env.STATUS_PAGE_WIDGET_API_URL?.trim() || DEFAULT_WIDGET_API_URL;
	const statusPageUrl =
		process.env.STATUS_PAGE_URL?.trim() || DEFAULT_STATUS_PAGE_URL;
	const [widgetResult, pageResult] = await Promise.allSettled([
		fetch(widgetApiUrl, {
			cache: "no-store",
			headers: { accept: "application/json" },
			signal,
		}),
		fetch(statusPageUrl, {
			cache: "no-store",
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
	if (!liveSummary || !structureSummary) {
		throw new Error("status_page_unavailable");
	}

	const summary: IncidentSummary = {
		...structureSummary,
		affected_components:
			widgetSummary?.affected_components ?? structureSummary.affected_components,
		in_progress_maintenances:
			widgetSummary?.in_progress_maintenances ??
			structureSummary.in_progress_maintenances,
		ongoing_incidents:
			widgetSummary?.ongoing_incidents ?? structureSummary.ongoing_incidents,
		scheduled_maintenances:
			widgetSummary?.scheduled_maintenances ??
			structureSummary.scheduled_maintenances,
	};
	const value = {
		components: flattenIncidentComponents(summary),
		href: String(
			widgetSummary?.page_url ?? pageSummary?.public_url ?? STATUS_PAGE_HREF,
		),
		status: pickIncidentStatus(liveSummary),
	};

	cachedSummary = {
		expiresAt: Date.now() + STATUS_PAGE_CACHE_TTL_MS,
		value,
	};

	return value;
}

export async function GET() {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 3500);

	try {
		const { components, href, status } = await fetchIncidentStatus(
			controller.signal,
		);
		const visibleComponents = components.filter((component) =>
			isVisibleComponent(component, components),
		);
		const componentIssues = visibleComponents.filter(
			(component) =>
				component.state !== "operational" && component.state !== "unknown",
		);
		const onlyThirdPartyIssues =
			componentIssues.length > 0 && componentIssues.every(isThirdPartyComponent);
		const label =
			status.state === "operational"
				? status.label
				: onlyThirdPartyIssues
					? "Slightly degraded"
				: componentIssues.length > 1
					? `${componentIssues.length} services affected`
					: status.label;

		return NextResponse.json(
			{
				ok: true,
				...status,
				label,
				components: visibleComponents,
				href,
			},
			{ headers: { "cache-control": "public, max-age=30, s-maxage=30" } },
		);
	} catch {
		return NextResponse.json(
			{
				ok: false,
				state: "unknown" satisfies StatusState,
				label: "Status unavailable",
				components: [],
				href: STATUS_PAGE_HREF,
			},
			{ headers: { "cache-control": "public, max-age=30, s-maxage=30" } },
		);
	} finally {
		clearTimeout(timeout);
	}
}
