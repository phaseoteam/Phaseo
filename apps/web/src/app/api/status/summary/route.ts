import { NextResponse } from "next/server";

type StatusState =
	| "operational"
	| "degraded"
	| "partial_outage"
	| "major_outage"
	| "maintenance"
	| "unknown";

const STATUS_PAGE_HREF = "https://phaseo.instatus.com/";
const DEFAULT_SUMMARY_URL = "https://phaseo.instatus.com/api/v2/summary.json";
const DEFAULT_COMPONENTS_URL =
	"https://phaseo.instatus.com/api/v2/components.json";

type ComponentStatus = {
	name: string;
	status: string;
	state: StatusState;
	label: string;
	parent: string | null;
};

type InstatusComponent = {
	name?: unknown;
	status?: unknown;
	children?: InstatusComponent[];
};

function displayComponentName(value: unknown) {
	return String(value ?? "")
		.trim()
		.replace(/\bAI\s+Stats\b/g, "Phaseo")
		.replace(/^Models API \(\/v1\/api\/models\)$/, "API Gateway");
}

function isThirdPartyComponent(component: ComponentStatus) {
	return `${component.name} ${component.parent ?? ""}`.includes("Third Party:");
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
		normalized === "all_systems_operational"
	) {
		return { state: "operational", label: "All systems operational" };
	}

	if (normalized === "hasissues") {
		return { state: "degraded", label: "Service issues reported" };
	}

	if (
		normalized.includes("maintenance") ||
		normalized === "under_maintenance"
	) {
		return { state: "maintenance", label: "Under maintenance" };
	}

	if (
		normalized.includes("major") ||
		normalized === "down" ||
		normalized === "major_outage"
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

function pickStatus(payload: unknown) {
	const data = payload as {
		page?: { status?: unknown; updated_at?: unknown };
		status?: { description?: unknown; indicator?: unknown };
	};

	const pageStatus = data?.page?.status;
	if (pageStatus) {
		return normalizeStatus(pageStatus);
	}

	const statusDescription = data?.status?.description;
	if (statusDescription) {
		return normalizeStatus(statusDescription);
	}

	const statusIndicator = data?.status?.indicator;
	if (statusIndicator) {
		return normalizeStatus(statusIndicator);
	}

	return normalizeStatus(null);
}

function withCacheBuster(value: string) {
	const url = new URL(value);
	url.searchParams.set("_", Date.now().toString());
	return url.toString();
}

function flattenComponents(
	components: InstatusComponent[] | undefined,
	parent: string | null = null,
): ComponentStatus[] {
	if (!Array.isArray(components)) return [];

	return components.flatMap((component) => {
		const name = displayComponentName(component?.name);
		const status = normalizeStatus(component?.status);
		const current = name
				? [
						{
							name,
							status: String(component.status ?? ""),
							state: status.state,
							label: status.label,
							parent,
						},
					]
				: [];
		const childParent = name ? (parent ? `${parent} / ${name}` : name) : parent;

		return [
			...current,
			...flattenComponents(component?.children, childParent),
		];
	});
}

async function fetchComponents(signal: AbortSignal) {
	const componentsUrl =
		process.env.STATUS_PAGE_COMPONENTS_URL?.trim() || DEFAULT_COMPONENTS_URL;
	const response = await fetch(withCacheBuster(componentsUrl), {
		cache: "no-store",
		headers: { accept: "application/json" },
		signal,
	});

	if (!response.ok) {
		throw new Error(`status_components_http_${response.status}`);
	}

	const payload = (await response.json()) as { components?: InstatusComponent[] };
	return flattenComponents(payload.components).slice(0, 24);
}

export async function GET() {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 3500);

	try {
		const summaryUrl =
			process.env.STATUS_PAGE_SUMMARY_URL?.trim() || DEFAULT_SUMMARY_URL;
		const [summaryResult, componentsResult] = await Promise.allSettled([
			fetch(withCacheBuster(summaryUrl), {
				cache: "no-store",
				headers: { accept: "application/json" },
				signal: controller.signal,
			}),
			fetchComponents(controller.signal),
		]);

		if (summaryResult.status === "rejected") {
			throw summaryResult.reason;
		}

		const response = summaryResult.value;

		if (!response.ok) {
			throw new Error(`status_summary_http_${response.status}`);
		}

		const payload = (await response.json()) as unknown;
		const status = pickStatus(payload);
		const components =
			componentsResult.status === "fulfilled"
				? componentsResult.value
				: [];
		const visibleComponents = components.filter(
			(component) =>
				!(
					component.name === "API" &&
					component.parent === null &&
					components.some((candidate) =>
						candidate.name.startsWith("API health ("),
					)
				),
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
				href: STATUS_PAGE_HREF,
			},
			{ headers: { "cache-control": "no-store" } },
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
			{ headers: { "cache-control": "no-store" } },
		);
	} finally {
		clearTimeout(timeout);
	}
}
