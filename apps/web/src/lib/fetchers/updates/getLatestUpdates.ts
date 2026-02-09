// lib/fetchers/updates/getLatestUpdates.ts
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/utils/supabase/client";

import type React from "react";
import type { LucideIcon } from "lucide-react";
import { Package, Globe, MonitorPlay } from "lucide-react";

// ------------------------------
// Types
// ------------------------------
type DbRow = {
    id: string;
    type: "youtube" | "web";
    who: string;
    title: string;
    link: string;
    created_at: string;
};

// Shape expected by your <UpdateCard /> component
export type UpdateCardProps = {
    id?: string | number;
    badges?: Array<{
        label: string;
        icon?: React.ComponentType<{ className?: string }> | null;
        className?: string;
    }>;
    avatar?: { organisationId: string; name?: string | null } | null;
    source?: string | null;
    tags?: string[] | null;
    title: string;
    subtitle?: string | null;
    link: { href: string; external?: boolean; cta?: string | null };
    dateIso?: string | null;
    accentClass?: string | null;
    className?: string;
};

// ------------------------------
// Display meta per category
// ------------------------------
const UPDATE_ENTRY_META: Record<
    "web" | "youtube",
    {
        label: string;
        icon: LucideIcon;
        badgeClass: string;
        accentClass: string;
    }
> = {
    web: {
        label: "Web",
        icon: Globe,
        badgeClass:
            "px-2 py-1 text-xs flex items-center gap-1 transition-colors bg-sky-100 text-sky-900 border border-sky-300 hover:bg-sky-200 hover:text-sky-900 hover:border-sky-400 dark:bg-sky-900/60 dark:text-sky-200 dark:border-sky-700 dark:hover:bg-sky-900 dark:hover:text-sky-200 dark:hover:border-sky-600 rounded-full",
        accentClass: "bg-sky-500",
    },
    youtube: {
        label: "YouTube",
        icon: MonitorPlay,
        badgeClass:
            "px-2 py-1 text-xs flex items-center gap-1 transition-colors bg-rose-100 text-rose-900 border border-rose-300 hover:bg-rose-200 hover:text-rose-900 hover:border-rose-400 dark:bg-rose-900/60 dark:text-rose-200 dark:border-rose-700 dark:hover:bg-rose-900 dark:hover:text-rose-200 dark:hover:border-rose-600 rounded-full",
        accentClass: "bg-rose-500",
    },
};

// ------------------------------
// Helpers
// ------------------------------
function isExternal(href: string) {
    try {
        const url = new URL(href);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function relTime(iso: string, nowMs: number) {
    const diffMs = nowMs - Date.parse(iso);
    const sec = Math.round(diffMs / 1000);
    const abs = Math.abs(sec);
    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

    if (abs < 60) return rtf.format(-sec, "second");
    const min = Math.round(sec / 60);
    if (Math.abs(min) < 60) return rtf.format(-min, "minute");
    const hrs = Math.round(min / 60);
    if (Math.abs(hrs) < 24) return rtf.format(-hrs, "hour");
    const days = Math.round(hrs / 24);
    if (Math.abs(days) < 30) return rtf.format(-days, "day");
    const months = Math.round(days / 30);
    if (Math.abs(months) < 12) return rtf.format(-months, "month");
    const years = Math.round(months / 12);
    return rtf.format(-years, "year");
}

function normaliseCategory(
    subtype: string | null | undefined,
    link: string
): "web" | "youtube" {
    const t = (subtype ?? "").toLowerCase();
    if (t === "youtube" || /youtu\.?be/.test(link)) return "youtube";
    return "web";
}

// ------------------------------
// Low-level DB fetch (NOT exported)
// ------------------------------
async function fetchLatestUpdateRows(limit: number): Promise<DbRow[]> {
    const supabase = await createClient();

    const { data, error } = (await supabase
        .from("updates")
        .select("id,type,who,title,link,created_at")
        .order("created_at", { ascending: false })
        .limit(limit)) as { data: DbRow[] | null; error: any };

    if (error) {
        console.error("[updates] Supabase query failed:", error);
        return [];
    }
    return (data ?? []).map((r) => ({
        ...r,
        // ensure ISO normalisation
        created_at: new Date(r.created_at).toISOString(),
    }));
}

// ------------------------------
// Cached rows (serialisable only)
// NOTE: we intentionally DO NOT cache React components.
// Always fetch up to CACHE_LIMIT and slice later.
// ------------------------------
const CACHE_LIMIT = 32;

async function getLatestUpdateRowsCached(): Promise<{
    rows: DbRow[];
    generatedAt: string;
}> {
    "use cache";

    cacheLife("days");
    cacheTag("data:latest-updates");

    const now = new Date();
    const rows = await fetchLatestUpdateRows(CACHE_LIMIT);
    return {
        rows,
        generatedAt: now.toISOString(),
    };
}

// ------------------------------
// Public API: returns ready-to-render UpdateCard props
// (icons are attached AFTER pulling cached rows)
// ------------------------------
export async function getLatestUpdateCards(
    limit = 5
): Promise<UpdateCardProps[]> {
    const { rows, generatedAt } = await getLatestUpdateRowsCached();
    const nowMs = Date.parse(generatedAt);

    return rows.slice(0, limit).map((r) => {
        const cat = normaliseCategory(r.type, r.link);
        const meta = UPDATE_ENTRY_META[cat];
        const cta = cat === "youtube" ? "Watch" : cat === "web" ? "Read" : "Open";
        // always show the 'who' field from the DB as the subtitle
        const subtitle = r.who;

        return {
            id: r.id,
            title: r.title,
            link: { href: r.link, external: isExternal(r.link), cta },
            subtitle,
            dateIso: r.created_at,
            relative: relTime(r.created_at, nowMs),
            badges: [
                {
                    label: `${meta.label} Watcher`,
                    // cast to the minimal icon prop surface you use
                    icon: meta.icon as unknown as React.ComponentType<{
                        className?: string;
                    }>,
                    className: meta.badgeClass,
                },
            ],
            accentClass: meta.accentClass,
        };
    });
}
