// lib/fetchers/updates/getLatestModelUpdate.ts
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/utils/supabase/client";
import { applyHiddenFilter } from "@/lib/fetchers/models/visibility";

import type React from "react";
import { Megaphone, Rocket, Ban, Archive } from "lucide-react";

// --------------------------------------
// Types
// --------------------------------------
export type EventType = "Announced" | "Released" | "Deprecated" | "Retired";

type ModelRow = {
    model_id: string;
    name: string;
    organisation_id: string;
    announcement_date: string | null;
    release_date: string | null;
    deprecation_date: string | null;
    retirement_date: string | null;
    organisation: { organisation_id: string; name: string | null } | null;
};

type SerialisedModelEvent = {
    model: {
        model_id: string;
        name: string;
        organisation: { organisation_id: string; name: string | null };
    };
    types: EventType[]; // sorted by rank (Released, Announced, Deprecated, Retired)
    date: string; // ISO
};

// Shape expected by your <UpdateCard />
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
    relative?: string | null;
    accentClass?: string | null;
    className?: string;
};

// --------------------------------------
// Config + helpers
// --------------------------------------
const TYPE_RANK: Record<EventType, number> = {
    Released: 0,
    Announced: 1,
    Deprecated: 2,
    Retired: 3,
};

const EVENT_BADGE_META: Record<
    EventType,
    { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
    Announced: {
        label: "Announcement",
        icon: Megaphone,
        className:
            "bg-blue-100 text-blue-800 border border-blue-300 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-blue-200 hover:text-blue-900 hover:border-blue-400 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:hover:border-blue-700 rounded-full",
    },
    Released: {
        label: "Release",
        icon: Rocket,
        className:
            "bg-green-100 text-green-800 border border-green-300 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-green-200 hover:text-green-900 hover:border-green-400 dark:bg-green-950 dark:text-green-300 dark:border-green-800 dark:hover:bg-green-900 dark:hover:text-green-200 dark:hover:border-green-700 rounded-full",
    },
    Deprecated: {
        label: "Deprecation",
        icon: Ban,
        className:
            "bg-red-100 text-red-800 border border-red-300 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-red-200 hover:text-red-900 hover:border-red-400 dark:bg-red-950 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900 dark:hover:text-red-200 dark:hover:border-red-700 rounded-full",
    },
    Retired: {
        label: "Retirement",
        icon: Archive,
        className:
            "bg-zinc-300 text-zinc-800 border border-zinc-400 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-zinc-400 hover:text-zinc-900 hover:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:hover:border-zinc-600 rounded-full",
    },
};

const ACCENT_BY_PRIMARY: Partial<Record<EventType, string>> = {
    Released: "bg-green-500",
    Announced: "bg-blue-500",
    Deprecated: "bg-red-500",
    Retired: "bg-zinc-500",
};

function toIsoOrNull(v: string | null | undefined): string | null {
    if (!v) return null;
    const s = String(v).trim();
    if (!s || s === "-") return null;
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
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

// --------------------------------------
// Build serialisable events from DB rows
// --------------------------------------
async function fetchAllModelRows(includeHidden: boolean): Promise<ModelRow[]> {
    const supabase = await createClient();

    const { data, error } = await applyHiddenFilter(
        supabase
            .from("data_models")
            .select(`
      model_id,
      name,
      organisation_id,
      announcement_date,
      release_date,
      deprecation_date,
      retirement_date,
      organisation:data_organisations!data_models_organisation_id_fkey(organisation_id,name)
    `)
            .or(
                "announcement_date.not.is.null,release_date.not.is.null,deprecation_date.not.is.null,retirement_date.not.is.null"
            ),
        includeHidden
    );

    if (error) {
        console.error("[model-updates] Supabase query failed:", error);
        return [];
    }
    return (data ?? []) as unknown as ModelRow[];
}

function buildSerialisedEvents(rows: ModelRow[], now: Date): SerialisedModelEvent[] {
    const byKey = new Map<string, SerialisedModelEvent>();
    const nowMs = +now;

    const push = (
        model: SerialisedModelEvent["model"],
        type: EventType,
        dateMaybe: string | null
    ) => {
        const iso = toIsoOrNull(dateMaybe);
        if (!iso) return;
        if (Date.parse(iso) > nowMs) return;

        const key = `${model.model_id}|${iso}`;
        const existing = byKey.get(key);
        if (existing) {
            if (!existing.types.includes(type)) {
                existing.types.push(type);
                existing.types.sort((a, b) => TYPE_RANK[a] - TYPE_RANK[b]);
            }
        } else {
            byKey.set(key, { model, types: [type], date: iso });
        }
    };

    for (const r of rows) {
        const model = {
            model_id: r.model_id,
            name: r.name,
            organisation: {
                organisation_id: r.organisation?.organisation_id ?? r.organisation_id,
                name: r.organisation?.name ?? null,
            },
        };

        push(model, "Announced", r.announcement_date);
        push(model, "Released", r.release_date);
        push(model, "Deprecated", r.deprecation_date);
        push(model, "Retired", r.retirement_date);
    }

    // Deterministic: primary type rank asc (Released first), then date desc, then org_id asc, then model_id asc
    return [...byKey.values()].sort((a, b) => {
        const rankA = TYPE_RANK[a.types[0]];
        const rankB = TYPE_RANK[b.types[0]];
        if (rankA !== rankB) return rankA - rankB;
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        if (a.model.organisation.organisation_id !== b.model.organisation.organisation_id) {
            return a.model.organisation.organisation_id.localeCompare(b.model.organisation.organisation_id);
        }
        return a.model.model_id.localeCompare(b.model.model_id);
    });
}

// --------------------------------------
// Cached serialisable events (no React components)
// --------------------------------------
const CACHE_LIMIT = 64;

async function getSerialisedModelEventsCached(
    includeHidden: boolean
): Promise<{ events: SerialisedModelEvent[]; generatedAt: string }> {
    "use cache";

    cacheLife("days");
    cacheTag("data:model-updates");

    const now = new Date();
    const rows = await fetchAllModelRows(includeHidden);
    const events = buildSerialisedEvents(rows, now);
    return {
        events: events.slice(0, CACHE_LIMIT),
        generatedAt: now.toISOString(),
    };
}

// --------------------------------------
// Public: ready-to-render UpdateCard props
// --------------------------------------
export async function getLatestModelUpdateCards(
    limit = 5,
    includeHidden: boolean
): Promise<UpdateCardProps[]> {
    const { events, generatedAt } = await getSerialisedModelEventsCached(includeHidden);
    const nowMs = Date.parse(generatedAt);

    return events.slice(0, limit).map((e) => {
        // Badges for each event type on this date/model
        const badges = e.types.map((t) => {
            const meta = EVENT_BADGE_META[t];
            return {
                label: meta.label,
                icon: meta.icon,
                className: meta.className,
            };
        });

        const primary = e.types[0];
        const accentClass = (primary && ACCENT_BY_PRIMARY[primary]) || null;

        const orgId = (e.model.organisation.organisation_id || "").toLowerCase();

        return {
            id: `${e.model.model_id}-${e.date}`,
            badges,
            avatar: {
                organisationId: orgId,
                name: e.model.organisation.name,
            },
            title: e.model.name,
            subtitle: e.model.organisation.name,
            source: e.model.organisation.name,
            link: {
                href: `/models/${e.model.model_id}`,
                external: false,
                cta: "View",
            },
            dateIso: e.date,
            relative: relTime(e.date, nowMs),
            accentClass,
        };
    });
}
