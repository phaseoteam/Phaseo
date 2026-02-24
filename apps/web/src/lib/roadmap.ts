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
    | "Sparkles";

export type RoadmapMilestone = {
    key: string;               // stable id, e.g. "benchmarks"
    title: string;
    subtitle?: string;
    status: RoadmapStatus;
    description?: string;
    icon: IconName;
    href?: string;

    // Planning & shipping metadata
    due?: string;              // e.g. "Oct 2025 to Nov 2025" (for non-shipped)
    shippedAt?: string;        // ISO date "YYYY-MM-DD" (for shipped)
    continuous?: boolean;      // true for ongoing items like the Gateway

    // Optional extras you can use on ComingSoon pages
    featureList?: string[];
    tags?: string[];
};

export const MILESTONES: RoadmapMilestone[] = [
	{
		key: "gateway",
		title: "Gateway Coverage Expansion",
		status: "Ongoing",
		description:
			"Continuous expansion of supported providers, models, and modalities with smarter routing defaults.",
		icon: "Infinity",
		continuous: true,
		href: "/gateway",
	},
	{
		key: "expanded-database",
		title: "Database Coverage",
		status: "Ongoing",
		description:
			"Continuous ingestion and validation of model, provider, pricing, and release data across the catalog.",
		icon: "BookOpen",
		continuous: true,
		href: "/models",
	},
	{
		key: "usage-limits",
		title: "Usage Limits",
		status: "In Progress",
		due: "Apr 2026",
		description:
			"Per-key spend and usage controls to reduce accidental overspend and enforce team budgets.",
		icon: "BadgeDollarSign",
		href: "/settings/keys",
	},
	{
		key: "guardrails",
		title: "Guardrails",
		status: "In Progress",
		due: "Apr 2026",
		description:
			"Expanded safety, policy, and moderation controls across gateway traffic.",
		icon: "Sparkles",
		href: "/settings/guardrails",
	},
	{
		key: "privacy-settings",
		title: "Privacy Settings",
		status: "In Progress",
		due: "Apr 2026",
		description:
			"More granular privacy and retention controls for teams using AI Stats Gateway.",
		icon: "BookOpen",
		href: "/settings/privacy",
	},
	{
		key: "provisioning-keys",
		title: "Management API Keys",
		status: "Planned",
		due: "May 2026",
		description:
			"Automated creation and lifecycle management for elevated management credentials.",
		icon: "BadgeDollarSign",
		href: "/settings/keys",
	},
	{
		key: "presets",
		title: "Preset Marketplace",
		status: "Planned",
		due: "May 2026",
		description:
			"Improved sharing, discovery, and one-click adoption of production-ready preset configurations.",
		icon: "Sparkles",
		href: "/gateway/marketplace",
	},
	{
		key: "anthropic-compatibility",
		title: "Anthropic Compatibility",
		status: "Shipped",
		shippedAt: "2026-01-30",
		description:
			"Anthropic Messages API compatibility shipped via the gateway /messages endpoint.",
		icon: "Bot",
		href: "/gateway",
	},
	{
		key: "organisation-page",
		title: "Organisation Pages",
		status: "Shipped",
		shippedAt: "2025-11-26",
		description: "Dedicated organisation pages with linked models and metadata.",
		icon: "Users",
		href: "/organisations",
	},
	{
		key: "model-page",
		title: "Model Pages",
		status: "Shipped",
		shippedAt: "2025-11-26",
		description: "Dedicated model pages with pricing, availability, and quickstart details.",
		icon: "Bot",
		href: "/models",
	},
	{
		key: "benchmarks",
		title: "Benchmark Pages",
		status: "Shipped",
		shippedAt: "2025-11-26",
		description:
			"Benchmark pages with rank deltas and per-model performance comparisons.",
		icon: "BarChart3",
		href: "/benchmarks",
	},
	{
		key: "api-providers",
		title: "API Provider Pages",
		status: "Shipped",
		shippedAt: "2025-11-26",
		description:
			"Provider pages with supported models, pricing references, and capability coverage.",
		icon: "BadgeDollarSign",
		href: "/api-providers",
	},
	{
		key: "latest-updates",
		title: "Latest Updates",
		status: "Shipped",
		shippedAt: "2025-11-26",
		description:
			"A single stream for releases, announcements, and database updates.",
		icon: "BookOpen",
		href: "/updates",
	},
	{
		key: "countries-pages",
		title: "Countries Pages",
		status: "Shipped",
		shippedAt: "2025-12-03",
		description: "Country-level views that connect organisations and model activity.",
		icon: "Users",
		href: "/countries",
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
		key: "database-updates",
		title: "Database Update Feed",
		status: "Shipped",
		shippedAt: "2025-12-19",
		description:
			"Expanded update feed that surfaces ongoing database-level changes.",
		icon: "BookOpen",
		href: "/updates",
	},
	{
		key: "sources",
		title: "Inline Sources",
		status: "Shipped",
		shippedAt: "2025-12-29",
		description:
			"Source attribution surfaced directly alongside relevant model and provider data.",
		icon: "BookOpen",
	},
	{
		key: "compare",
		title: "Model Comparisons",
		status: "Shipped",
		shippedAt: "2026-01-18",
		description:
			"Side-by-side model comparison across pricing, capabilities, and key metadata.",
		icon: "GitCompare",
		href: "/compare",
	},
];

// ------- helpers you already use on the page -------
export function getMilestone(key: string) {
    return MILESTONES.find((m) => m.key === key);
}

export function parseDate(s?: string): Date | null {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function monthKeyFromDate(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; // YYYY-MM
}
export function monthLabelFromKey(key: string) {
    const d = new Date(`${key}-01T00:00:00Z`);
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
export function formatShortDate(d: Date) {
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function parseDueDate(due?: string): Date | null {
    if (!due) return null;
    // Regex to find the first month year, like "Nov 2025" or "Early Dec 2025"
    const match = due.match(/([A-Za-z]+) (\d{4})/);
    if (!match) return null;
    const monthStr = match[1];
    const year = parseInt(match[2]);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthIndex = monthNames.findIndex(m => m.toLowerCase() === monthStr.toLowerCase());
    if (monthIndex === -1) return null;
    return new Date(year, monthIndex, 1);
}

export function splitUpcomingAndShipped() {
    const upcoming = MILESTONES.filter((m) => m.status !== "Shipped");
    const statusOrder = { "Ongoing": 0, "In Progress": 1, "Beta": 1, "Planned": 2 };

    upcoming.sort((a, b) => {
        const statusA = statusOrder[a.status as keyof typeof statusOrder] ?? 3;
        const statusB = statusOrder[b.status as keyof typeof statusOrder] ?? 3;
        if (statusA !== statusB) return statusA - statusB;
        const dateA = parseDueDate(a.due);
        const dateB = parseDueDate(b.due);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.getTime() - dateB.getTime();
    });

    const shippedRaw = MILESTONES
        .filter((m) => m.status === "Shipped" && parseDate(m.shippedAt))
        .map((m) => ({ ...m, _date: parseDate(m.shippedAt)! }));

    const shippedGroups = Object.entries(
        shippedRaw.reduce((acc, m) => {
            const key = monthKeyFromDate(m._date);
            (acc[key] ||= []).push(m);
            return acc;
        }, {} as Record<string, (typeof shippedRaw)[number][]>)
    ).sort(([a], [b]) => (a > b ? -1 : 1)); // newest month first

    return { upcoming, shippedGroups };
}
