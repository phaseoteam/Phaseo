import type { LucideIcon } from "lucide-react";
import { Cpu, Globe, MonitorPlay, Package } from "lucide-react";

export type UpdateCategoryId =
    | "overview"
    | "models"
    | "web"
    | "youtube";

export type UpdateTabId = UpdateCategoryId | "calendar";
export type UpdateEntry = {
    id: string | number;
    category: Exclude<UpdateCategoryId, "overview">;
    title: string;
    description?: string | null;
    href: string;
    source: string;
    publishedAt: string;
    tags?: string[];
    external?: boolean;
};

export type UpdateCategoryMeta = {
    id: UpdateCategoryId;
    label: string;
    description: string;
    icon: LucideIcon;
};

// Helper to parse a timestamp string as UTC. If the input has no timezone
// designator but looks like an ISO date/time, we treat it as UTC to avoid
// local timezone skew. Falls back to `new Date(value)` for other inputs.
function parseUtc(value: string | undefined | null): Date {
    if (!value) return new Date(NaN);

    // If the string ends with 'Z' or contains an offset (+/-HH:MM), Date will
    // parse it as UTC or with that offset. If it doesn't, append 'Z' so it's
    // interpreted as UTC rather than local time.
    if (/[zZ]$/.test(value) || /[+-]\d{2}:?\d{2}$/.test(value)) {
        return new Date(value);
    }

    // If it looks like an ISO date/time without timezone, append 'Z'.
    if (/^\d{4}-\d{2}-\d{2}([tT]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?)?$/.test(value)) {
        return new Date(value + "Z");
    }

    // Fallback: let Date try to parse it (may be locale dependent).
    return new Date(value);
}

export const UPDATE_CATEGORY_ORDER: UpdateCategoryId[] = [
    "overview",
    "models",
    "web",
    "youtube",
];

export const UPDATE_TAB_ORDER: UpdateTabId[] = [
    "overview",
    "models",
    "web",
    "youtube",
    "calendar",
];

export const UPDATE_ENTRY_META: Record<
    Exclude<UpdateCategoryId, "overview">,
    {
        label: string;
        icon: LucideIcon;
        badgeClass: string;
        accentClass: string;
    }
> = {
    models: {
        label: "Model",
        icon: Cpu,
        badgeClass:
            "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-200",
        accentClass: "bg-indigo-500",
    },
    // apps: {
    //     label: "App",
    //     icon: Package,
    //     badgeClass:
    //         "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200",
    //     accentClass: "bg-emerald-500",
    // },
    web: {
        label: "Web",
        icon: Globe,
        badgeClass:
            "bg-sky-100 text-sky-900 dark:bg-sky-900/60 dark:text-sky-200",
        accentClass: "bg-sky-500",
    },
    youtube: {
        label: "YouTube",
        icon: MonitorPlay,
        badgeClass:
            "bg-rose-100 text-rose-900 dark:bg-rose-900/60 dark:text-rose-200",
        accentClass: "bg-rose-500",
    },
};

export function getActiveFeaturedEntry(): null {
    return null;
}

export function getFeaturedSchedule(): any[] {
    return [];
}

export function formatUpdateRelativeTime(publishedAt: string): string {
    const parsed = parseUtc(publishedAt);
    if (Number.isNaN(parsed.getTime())) {
        return publishedAt;
    }

    // Avoid reading the current time during prerender. Use the deploy time if available.
    const now = new Date(
        process.env.NEXT_PUBLIC_DEPLOY_TIME ??
            process.env.DEPLOY_TIME ??
            "1970-01-01T00:00:00.000Z"
    );
    // Use UTC times for the difference calculation to avoid local timezone skew
    const diff = parsed.getTime() - Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds(),
        now.getUTCMilliseconds()
    );
    const absSeconds = Math.abs(diff) / 1000;

    const rtf = new Intl.RelativeTimeFormat("en", {
        numeric: "auto",
    });

    if (absSeconds < 60) {
        return diff < 0 ? "just now" : "in a moment";
    }
    if (absSeconds < 3600) {
        const minutes = Math.round(diff / 60_000);
        return rtf.format(minutes, "minute");
    }
    if (absSeconds < 86_400) {
        const hours = Math.round(diff / 3_600_000);
        return rtf.format(hours, "hour");
    }
    if (absSeconds < 2_592_000) {
        const days = Math.round(diff / 86_400_000);
        return rtf.format(days, "day");
    }
    const months = Math.round(diff / 2_592_000_000);
    if (Math.abs(months) < 12) {
        return rtf.format(months, "month");
    }

    return parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}
