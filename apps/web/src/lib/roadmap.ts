// lib/roadmap.ts
export type RoadmapStatus = "Planned" | "In Progress" | "Beta" | "Shipped" | "Ongoing";

export type IconName =
	| "Infinity"
	| "Bot"
	| "BarChart3"
	| "BadgeDollarSign"
	| "BookOpen"
	| "GitCompare"
	| "Users"
	| "Sparkles"
	| "Activity"
	| "Gauge"
	| "KeyRound"
	| "Layers3"
	| "LockKeyhole"
	| "RefreshCw"
	| "Route"
	| "ShieldCheck"
	| "Webhook";

export type RoadmapMilestone = {
	key: string;
	title: string;
	subtitle?: string;
	status: RoadmapStatus;
	description?: string;
	icon: IconName;
	href?: string;

	// Planning and shipping metadata.
	due?: string;
	shippedAt?: string;
	continuous?: boolean;

	// Optional extras used by coming-soon surfaces.
	featureList?: string[];
	tags?: string[];
};

export type ShippedRoadmapMilestone = RoadmapMilestone & { _date: Date };

export const MILESTONES: RoadmapMilestone[] = [
	{
		key: "gateway",
		title: "Gateway Coverage Expansion",
		status: "Ongoing",
		description:
			"We continuously add routable providers, models, modalities, and regions while improving direct integrations and routing resilience.",
		icon: "Infinity",
		continuous: true,
		href: "/api-providers",
	},
	{
		key: "expanded-database",
		title: "Catalog Coverage and Verification",
		status: "Ongoing",
		description:
			"Model, provider, pricing, availability, and lifecycle data keeps being ingested, checked, and corrected as the ecosystem changes.",
		icon: "BookOpen",
		continuous: true,
		href: "/models",
	},
	{
		key: "webhooks-async-delivery",
		title: "Webhooks and Async Delivery",
		status: "Shipped",
		shippedAt: "2026-09-15",
		description:
			"Signed webhook endpoints and job-specific event streams make asynchronous, batch, video, and realtime work easier to operate.",
		icon: "Webhook",
		href: "/settings/webhooks",
	},
	{
		key: "model-lifecycle",
		title: "Model Lifecycle Signals",
		status: "Shipped",
		shippedAt: "2026-09-13",
		description:
			"Deprecation notices, successor guidance, route ownership, and fresher public data make model changes easier to understand.",
		icon: "RefreshCw",
		href: "/updates",
	},
	{
		key: "provider-observability",
		title: "Provider Performance and Routing Visibility",
		status: "Shipped",
		shippedAt: "2026-09-13",
		description:
			"Hourly provider performance, service-tier-aware metrics, and request metadata show how the gateway made its decisions.",
		icon: "Activity",
		href: "/models",
	},
	{
		key: "service-tiers",
		title: "Service Tiers and Routing Controls",
		status: "Shipped",
		shippedAt: "2026-09-13",
		description:
			"Standard and faster processing paths are exposed in chat and reflected in billing, pricing, and provider performance data.",
		icon: "Gauge",
		href: "/chat",
	},
	{
		key: "batch-video-realtime",
		title: "Batch, Video, and Realtime Inference",
		status: "Shipped",
		shippedAt: "2026-09-07",
		description:
			"Expanded media and asynchronous workflows now have dedicated product surfaces, lifecycle handling, and usage logs.",
		icon: "Layers3",
		href: "/chat/realtime",
	},
	{
		key: "native-provider-coverage",
		title: "Native Provider Coverage and Pricing",
		status: "Shipped",
		shippedAt: "2026-09-08",
		description:
			"More direct provider integrations, regional identities, model routes, and pricing records are now represented in the gateway and catalog.",
		icon: "Route",
		href: "/api-providers",
	},
	{
		key: "private-models",
		title: "Private Models and BYOK Routes",
		status: "Shipped",
		shippedAt: "2026-09-04",
		description:
			"Workspaces can register private models and use provider credentials for routes that should stay under their control.",
		icon: "LockKeyhole",
		href: "/settings/workspaces/private-models",
	},
	{
		key: "usage-limits",
		title: "Usage and Spend Limits",
		status: "Shipped",
		shippedAt: "2026-09-03",
		description:
			"Per-key request and spend controls, provider rate-limit visibility, and guardrail-boundary enforcement make usage more predictable.",
		icon: "BadgeDollarSign",
		href: "/settings/keys",
	},
	{
		key: "presets",
		title: "Preset Marketplace",
		status: "Shipped",
		shippedAt: "2026-08-30",
		description:
			"Public preset discovery now includes publisher pages, version lineage, forks, feedback, and one-click adoption of useful configurations.",
		icon: "Sparkles",
		href: "/gateway/marketplace",
	},
	{
		key: "guardrails",
		title: "Guardrails",
		status: "Shipped",
		shippedAt: "2026-08-30",
		description:
			"Workspace and key policies cover model and provider boundaries, prompt-injection checks, sensitive-information handling, and member assignments.",
		icon: "ShieldCheck",
		href: "/settings/guardrails",
	},
	{
		key: "provisioning-keys",
		title: "Management API Keys",
		status: "Shipped",
		shippedAt: "2026-07-14",
		description:
			"Scoped management keys and lifecycle controls support workspace, settings, integration, guardrail, and observability automation.",
		icon: "KeyRound",
		href: "/settings/management-api-keys",
	},
	{
		key: "privacy-settings",
		title: "Privacy Settings",
		status: "Shipped",
		shippedAt: "2026-08-14",
		description:
			"Workspace-wide controls for provider data policies, training preferences, retention, and account-data deletion are available.",
		icon: "LockKeyhole",
		href: "/settings/privacy",
	},
	{
		key: "agent-sdk-cli",
		title: "SDKs, CLI, and Agent Integrations",
		status: "Shipped",
		shippedAt: "2026-05-19",
		description:
			"The TypeScript Agent SDK and expanding CLI integrations make Phaseo usable from the tools developers already rely on.",
		icon: "Bot",
	},
	{
		key: "anthropic-compatibility",
		title: "Anthropic Compatibility",
		status: "Shipped",
		shippedAt: "2026-01-30",
		description:
			"Anthropic Messages API compatibility is available through the gateway /messages endpoint.",
		icon: "Bot",
		href: "/gateway",
	},
	{
		key: "compare",
		title: "Model Comparisons",
		status: "Shipped",
		shippedAt: "2026-01-18",
		description:
			"Side-by-side comparison across pricing, capabilities, provider availability, and key model metadata.",
		icon: "GitCompare",
		href: "/compare",
	},
	{
		key: "sources",
		title: "Inline Sources",
		status: "Shipped",
		shippedAt: "2025-12-29",
		description:
			"Source attribution appears alongside relevant model and provider data so important claims can be checked.",
		icon: "BookOpen",
	},
	{
		key: "database-updates",
		title: "Database Update Feed",
		status: "Shipped",
		shippedAt: "2025-12-19",
		description:
			"A public update feed surfaces changes to catalog records and the data behind the product.",
		icon: "BookOpen",
		href: "/updates",
	},
	{
		key: "revamped-pricing-page",
		title: "Pricing Reference Refresh",
		status: "Shipped",
		shippedAt: "2025-12-12",
		description:
			"A cleaner pricing reference experience with model and provider-focused navigation.",
		icon: "BadgeDollarSign",
			href: "/tools/pricing-calculator",
	},
	{
		key: "countries-pages",
		title: "Countries Pages",
		status: "Shipped",
		shippedAt: "2025-12-03",
		description: "Country-level views connect organisations and model activity.",
		icon: "Users",
		href: "/countries",
	},
	{
		key: "latest-updates",
		title: "Latest Updates",
		status: "Shipped",
		shippedAt: "2025-11-26",
		description: "A single stream for releases, announcements, and catalog updates.",
		icon: "BookOpen",
		href: "/updates",
	},
	{
		key: "api-providers",
		title: "API Provider Pages",
		status: "Shipped",
		shippedAt: "2025-11-26",
		description:
			"Provider pages connect supported models, pricing references, and capability coverage.",
		icon: "BadgeDollarSign",
		href: "/api-providers",
	},
	{
		key: "benchmarks",
		title: "Benchmark Pages",
		status: "Shipped",
		shippedAt: "2025-11-26",
		description:
			"Benchmark pages show rank changes and per-model performance comparisons.",
		icon: "BarChart3",
		href: "/benchmarks",
	},
	{
		key: "model-page",
		title: "Model Pages",
		status: "Shipped",
		shippedAt: "2025-11-26",
		description: "Dedicated model pages show pricing, availability, and quickstart details.",
		icon: "Bot",
		href: "/models",
	},
	{
		key: "organisation-page",
		title: "Organisation Pages",
		status: "Shipped",
		shippedAt: "2025-11-26",
		description: "Dedicated organisation pages connect labs with their models and metadata.",
		icon: "Users",
		href: "/organisations",
	},
];

export function getMilestone(key: string) {
	return MILESTONES.find((milestone) => milestone.key === key);
}

export function parseDate(value?: string): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function monthKeyFromDate(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabelFromKey(key: string) {
	const date = new Date(`${key}-01T00:00:00Z`);
	return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function formatShortDate(date: Date) {
	return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function parseDueDate(value?: string): Date | null {
	if (!value) return null;
	const match = value.match(/([A-Za-z]+) (\d{4})/);
	if (!match) return null;

	const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	const monthIndex = monthNames.findIndex((month) => month.toLowerCase() === match[1].toLowerCase());
	if (monthIndex === -1) return null;

	return new Date(Number(match[2]), monthIndex, 1);
}

export function splitUpcomingAndShipped(): {
	upcoming: RoadmapMilestone[];
	shippedGroups: Array<[string, ShippedRoadmapMilestone[]]>;
} {
	const upcoming = MILESTONES.filter((milestone) => milestone.status !== "Shipped").sort((a, b) => {
		const statusOrder: Record<string, number> = { Ongoing: 0, "In Progress": 1, Beta: 1, Planned: 2 };
		const statusDifference = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
		if (statusDifference !== 0) return statusDifference;

		const dateA = parseDueDate(a.due);
		const dateB = parseDueDate(b.due);
		if (!dateA && !dateB) return 0;
		if (!dateA) return 1;
		if (!dateB) return -1;
		return dateA.getTime() - dateB.getTime();
	});

	const shipped = MILESTONES.flatMap((milestone) => {
		const date = parseDate(milestone.shippedAt);
		return milestone.status === "Shipped" && date ? [{ ...milestone, _date: date }] : [];
	});

	const grouped = shipped.reduce<Record<string, ShippedRoadmapMilestone[]>>((groups, milestone) => {
		const key = monthKeyFromDate(milestone._date);
		(groups[key] ||= []).push(milestone);
		return groups;
	}, {});

	return {
		upcoming,
		shippedGroups: Object.entries(grouped)
			.sort(([a], [b]) => (a > b ? -1 : 1))
			.map(([key, items]) => [
				key,
				items.sort((a, b) => b._date.getTime() - a._date.getTime()),
			]),
	};
}
