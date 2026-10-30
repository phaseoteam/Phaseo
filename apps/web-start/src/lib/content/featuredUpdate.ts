export type FeaturedContentType = "video" | "livestream" | "article";

export type FeaturedAction = {
    label: string;
    href: string;
    external?: boolean;
};

export type FeaturedWindow = {
    start?: string;
    end?: string;
};

export type FeaturedEntry = {
    id: string;
    type: FeaturedContentType;
    title: string;
    shortTitle?: string;
    description: string;
    primaryAction: FeaturedAction;
    secondaryAction?: FeaturedAction;
    highlight?: string;
    meta?: {
        source?: string;
        publishedAt?: string;
    };
    window?: FeaturedWindow;
    alwaysOn?: boolean;
    disabled?: boolean;
};

// Helper to parse a timestamp string as UTC. If the input has no timezone
// designator but looks like an ISO date/time, we treat it as UTC to avoid
// local timezone skew. Falls back to `new Date(value)` for other inputs.
function parseUtc(value: string | undefined | null): Date {
    if (!value) return new Date(NaN);

    if (/[zZ]$/.test(value) || /[+-]\d{2}:?\d{2}$/.test(value)) {
        return new Date(value);
    }

    if (/^\d{4}-\d{2}-\d{2}([tT]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?)?$/.test(value)) {
        return new Date(value + "Z");
    }

    return new Date(value);
}

const FEATURED_SECTION_ENABLED =
    process.env.NEXT_PUBLIC_FEATURED_ENABLED !== "false";

const FEATURED_SCHEDULE: FeaturedEntry[] = [
    {
        id: "openai-devday-opening-keynote",
        type: "livestream",
        shortTitle: "OpenAI DevDay",
        title: "OpenAI DevDay Opening Keynote",
        description:
            "Sam Altman kicks off DevDay 2025 with a keynote to explore ideas that will challenge how you think about building.",
        primaryAction: {
            label: "Watch on YouTube",
            href: "https://www.youtube.com/watch?v=hS1YqcewH0c",
        },
        window: {
            start: "2025-10-06T00:00:00Z",
            end: "2025-10-08T23:59:59Z",
        },
    },
    {
        id: "figure-03",
        type: "video",
        shortTitle: "Figure 03 Launch",
        title: "Figure 03 Launch",
        description:
            "See the latest Figure Robot release.",
        primaryAction: {
            label: "Watch on YouTube",
            href: "https://www.youtube.com/watch?v=Eu5mYMavctM",
            external: true,
        },
        window: {
            start: "2025-10-09T14:00:00Z",
            end: "2025-10-10T23:59:59Z",
        },
    },
    {
        id: "figure-03-blog",
        type: "article",
        title: "Figure 03 Launch Blog Post",
        description:
            "Read the detailed blog post about Figure 03's features and capabilities.",
        primaryAction: {
            label: "Read the Article",
            href: "https://t.co/UVPav7Aebe",
            external: true,
        },
        window: {
            start: "2025-10-09T14:00:00Z",
            end: "2025-10-10T23:59:59Z",
        },
    },
    {
        id: "gemini-3",
        type: "article",
        title: "Introducing Gemini 3: Elevating AI to New Heights",
        description:
            "Discover the groundbreaking features of Gemini 3, Google's latest AI model that redefines intelligence and creativity.",
        primaryAction: {
            label: "Read the Article",
            href: "https://ai.googleblog.com/2024/10/introducing-gemini-3-elevating-ai-to.html",
            external: true,
        },
        window: {
            start: "2025-11-18T00:00:00Z",
            end: "2025-11-25T23:59:59Z",
        },
    }
];

function getWindowBoundary(
    entry: FeaturedEntry,
    boundary: "start" | "end"
): number {
    const raw = entry.window?.[boundary];
    if (!raw) {
        return boundary === "start" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    }
    const timestamp = parseUtc(raw).getTime();
    return Number.isNaN(timestamp)
        ? boundary === "start"
            ? Number.NEGATIVE_INFINITY
            : Number.POSITIVE_INFINITY
        : timestamp;
}

function isEntryActive(entry: FeaturedEntry, now: Date): boolean {
    if (entry.disabled) return false;
    if (entry.alwaysOn) return true;
    if (!entry.window) return false;

    const start = getWindowBoundary(entry, "start");
    const end = getWindowBoundary(entry, "end");
    const current = now.getTime();

    return current >= start && current <= end;
}

export function getActiveFeaturedEntries(at: Date = new Date()): FeaturedEntry[] {
    if (!FEATURED_SECTION_ENABLED) return [];

    const active = FEATURED_SCHEDULE.filter((entry) => isEntryActive(entry, at));

    if (active.length <= 1) return active;

    const alwaysVisible = active
        .filter((entry) => entry.alwaysOn)
        .sort((a, b) => getWindowBoundary(a, "start") - getWindowBoundary(b, "start"));

    const scheduled = active
        .filter((entry) => !entry.alwaysOn)
        .sort((a, b) => getWindowBoundary(a, "end") - getWindowBoundary(b, "end"));

    return [...alwaysVisible, ...scheduled];
}

export function getActiveFeaturedEntry(at: Date = new Date()): FeaturedEntry | null {
    const active = getActiveFeaturedEntries(at);
    return active.length > 0 ? active[0] : null;
}

export function getFeaturedSchedule(): FeaturedEntry[] {
    return FEATURED_SCHEDULE;
}
