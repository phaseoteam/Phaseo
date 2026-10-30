import type { ComponentType } from "react";

import type {
    EventType,
    ModelEvent,
} from "@/lib/fetchers/updates/types";
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
    category?: "models";
};

function formatUpdateRelativeTime(publishedAt: string): string {
    const parsed = new Date(publishedAt);
    if (Number.isNaN(parsed.getTime())) return publishedAt;

    const now = new Date(
        process.env.NEXT_PUBLIC_DEPLOY_TIME ??
            process.env.DEPLOY_TIME ??
            "1970-01-01T00:00:00.000Z"
    );
    const diff = parsed.getTime() - now.getTime();
    const absSeconds = Math.abs(diff) / 1000;
    const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

    if (absSeconds < 60) return diff < 0 ? "just now" : "in a moment";
    if (absSeconds < 3600) return formatter.format(Math.round(diff / 60_000), "minute");
    if (absSeconds < 86_400) return formatter.format(Math.round(diff / 3_600_000), "hour");
    if (absSeconds < 2_592_000) return formatter.format(Math.round(diff / 86_400_000), "day");
    const months = Math.round(diff / 2_592_000_000);
    if (Math.abs(months) < 12) return formatter.format(months, "month");
    return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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
