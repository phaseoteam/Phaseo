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
    due?: string;              // e.g. "Oct 2025 → Nov 2025" (for non-shipped)
    shippedAt?: string;        // ISO date "YYYY-MM-DD" (for shipped)
    continuous?: boolean;      // true for ongoing items like the Gateway

    // Optional extras you can use on ComingSoon pages
    featureList?: string[];
    tags?: string[];
};

export const MILESTONES: RoadmapMilestone[] = [
    {
        key: "gateway",
        title: "Expanded Gateway",
        status: "Ongoing",
        description:
            "Continuous expansion of supported models, modalities and providers with smarter and faster routing.",
        icon: "Infinity",
        continuous: true,
        href: "/gateway",
    },
    {
        key: "expanded-database",
        title: "Expanded Database",
        status: "Ongoing",
        description:
            "Continuous expansion of database capabilities with improved data management and performance.",
        icon: "BookOpen",
        continuous: true,
    },
    {
        key: "organisation-page",
        title: "Organisation Pages",
        status: "Shipped",
        shippedAt: "2025-11-26",
        description: "See all organisation information, on one page.",
        icon: "Bot",
        href: "/organisations",
    },
    {
        key: "model-page",
        title: "Model Pages",
        status: "Shipped",
        shippedAt: "2025-11-26",
        description: "See all model information, on one page.",
        icon: "Bot",
        href: "/models/gpt-5-2025-08-07",
    },
    {
        key: "benchmarks",
        title: "Benchmark Pages",
        status: "Shipped",
        shippedAt: "2025-11-26",
        description:
            "Interactive charts and rank deltas to see how models stack up across benchmarks.",
        icon: "BarChart3",
        href: "/benchmarks",
    },
    {
        key: "api-providers",
        title: "API Providers",
        status: "Shipped",
        shippedAt: "2025-11-26",
        description:
            "Unified pages to see what models a provider supports as well as other useful information.",
        icon: "BadgeDollarSign",
        href: "/api-providers",
    },
    {
        key: "latest-updates",
        title: "Latest Updates",
        status: "Shipped",
        shippedAt: "2025-11-26",
        description:
            "A page consolidating all the latest information about AI - from model releases, to new web pages, or new YouTube videos - your one stop shop for the latest in AI.",
        icon: "BookOpen",
        href: "/updates",
    },
    {
        key: "countries-pages",
        title: "Countries Pages",
        status: "Shipped",
        shippedAt: "2025-12-03",
        description: "See all country-specific AI information on one page.",
        icon: "Users",
        href: "/countries",
    },
    {
        key: "sources",
        title: "Sources",
        status: "Shipped",
        shippedAt: "2025-12-29",
        description:
            "Sources now live directly within each page, displayed alongside the relevant content.",
        icon: "BookOpen",
    },
    {
        key: "database-updates",
        title: "Database Updates",
        status: "Shipped",
        shippedAt: "2025-12-19",
        description:
            "An expansion of Latest Updates - this will show all changes made to the database allowing you to see what's changing in the database.",
        icon: "BookOpen",
    },
    {
        key: "compare",
        title: "Model Comparisons",
        status: "Beta",
        due: "Nov 2025",
        description:
            "Line up models side-by-side across benchmarks, providers, and pricing with ease.",
        icon: "GitCompare",
        href: "/compare",
    },
    {
        key: "playground",
        title: "Playground",
        status: "Planned",
        due: "Dec 2025",
        description:
            "Interactive playground for testing and experimenting with AI models.",
        icon: "Sparkles",
    },
    {
        key: "usage-limits",
        title: "Usage Limits for API Keys",
        status: "Beta",
        due: "Nov 2025",
        description:
            "Implement usage limits and monitoring for API keys to manage consumption.",
        icon: "BadgeDollarSign",
        href: "/settings/keys",
    },
    {
        key: "revamped-pricing-page",
        title: "Revamped Model Pricing Page",
        status: "Shipped",
        shippedAt: "2025-12-12",
        description: "A revamped page for model pricing information.",
        icon: "BadgeDollarSign",
    },
    {
        key: "provisioning-keys",
        title: "Management API Keys",
        status: "Planned",
        due: "Jan 2026",
        description:
            "Automated creation and management of elevated management API keys.",
        icon: "BadgeDollarSign",
    },
    {
        key: "presets",
        title: "Presets",
        status: "Planned",
        due: "Jan 2026",
        description:
            "Predefined configurations and presets for common AI use cases.",
        icon: "Sparkles",
    },
    {
        key: "anthropic-compatibility",
        title: "Anthropic Compatibility",
        status: "Planned",
        due: "Feb 2026",
        description:
            "Integrate Anthropic models into the platform for enhanced compatibility and support.",
        icon: "Bot",
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
