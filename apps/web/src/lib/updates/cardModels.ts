import type { ComponentType } from "react";

import {
    UPDATE_ENTRY_META,
    formatUpdateRelativeTime,
    type UpdateCategoryId,
    type UpdateEntry,
} from "@/lib/content/updates";
import type {
    EventType,
    ModelEvent,
} from "@/lib/fetchers/updates/getModelUpdates";
import { Ban, Archive, Megaphone, Rocket } from "lucide-react";

export type UpdateCardBadge = {
    label: string;
    icon?: ComponentType<{ className?: string }> | null;
    className?: string;
};

export type UpdateCardLink = {
    href: string;
    external?: boolean;
    cta?: string;
};

export type UpdateCardModel = {
    id: string | number;
    badges: UpdateCardBadge[];
    title: string;
    subtitle?: string | null;
    description?: string | null;
    link: UpdateCardLink;
    dateIso: string;
    relative: string;
    accentClass?: string | null;
    category?: UpdateCategoryId;
};

function normalizeBadgeClass(badgeClass?: string) {
    if (!badgeClass) {
        return "border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-200";
    }
    if (badgeClass.includes("px-") || badgeClass.includes("py-")) {
        return badgeClass;
    }
    return `border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${badgeClass}`;
}

function computeCta(entry: UpdateEntry): string {
    if (entry.category === "youtube") {
        return "Watch";
    }
    if (entry.external) {
        return "Open source";
    }
    return "Open";
}

export function toUpdateCardModel(entry: UpdateEntry): UpdateCardModel {
    const meta = UPDATE_ENTRY_META[entry.category];
    const badgeClass = normalizeBadgeClass(meta?.badgeClass);

    return {
        id: entry.id,
        badges: meta
            ? [
                {
                    label: meta.label,
                    icon: meta.icon,
                    className: badgeClass,
                },
            ]
            : [],
        title: entry.title,
        subtitle: entry.source ?? null,
        description: entry.description ?? null,
        link: {
            href: entry.href,
            external: entry.external,
            cta: computeCta(entry),
        },
        dateIso: entry.publishedAt,
        relative: formatUpdateRelativeTime(entry.publishedAt),
        accentClass: meta?.accentClass,
        category: entry.category,
    };
}

export function toUpdateCardModels(entries: UpdateEntry[]): UpdateCardModel[] {
    return entries.map(toUpdateCardModel);
}

type ModelEventBadgeMeta = {
    label: string;
    badgeClass: string;
    accentClass: string;
    icon: ComponentType<{ className?: string }>;
};

const MODEL_EVENT_BADGE_META: Record<EventType, ModelEventBadgeMeta> = {
    Announced: {
        label: "Announcement",
        badgeClass:
            "border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
        accentClass: "bg-sky-500",
        icon: Megaphone,
    },
    Released: {
        label: "Release",
        badgeClass:
            "border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
        accentClass: "bg-emerald-500",
        icon: Rocket,
    },
    Deprecated: {
        label: "Deprecation",
        badgeClass:
            "border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
        accentClass: "bg-red-500",
        icon: Ban,
    },
    Retired: {
        label: "Retired",
        badgeClass:
            "border border-zinc-300 bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300",
        accentClass: "bg-zinc-500",
        icon: Archive,
    },
};

export function modelEventsToCardModels(events: ModelEvent[]): UpdateCardModel[] {
    const cards: UpdateCardModel[] = [];

    for (const event of events) {
        const badgeMeta = MODEL_EVENT_BADGE_META[event.types[0] ?? "Announced"];
        const dateIso = event.date;
        if (!dateIso) continue;

        cards.push({
            id: `model-${event.model.model_id}-${dateIso}`,
            badges: [
                {
                    label: badgeMeta.label,
                    className: badgeMeta.badgeClass,
                    icon: badgeMeta.icon,
                },
            ],
            title: event.model.name,
            subtitle:
                event.model.organisation.name ??
                event.model.organisation.organisation_id,
            description: null,
            link: {
                href: `/models/${event.model.model_id}`,
                cta: "View model",
            },
            dateIso,
            relative: formatUpdateRelativeTime(dateIso),
            accentClass: badgeMeta.accentClass,
            category: "models",
        });
    }

    return cards;
}
