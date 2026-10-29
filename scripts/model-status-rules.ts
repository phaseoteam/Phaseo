// Date rules for the nightly status refresh (update-database-model-statuses.ts).
export type ModelStatus = "Rumoured" | "Announced" | "Limited Access" | "Withheld" | "Available" | "Deprecated" | "Retired" | null;

export type ModelDates = {
    announced_date?: unknown;
    release_date?: unknown;
    deprecation_date?: unknown;
    retirement_date?: unknown;
};

export type DerivedStatus = {
    status: Exclude<ModelStatus, null>;
    reason: string;
};

const STATUS_ORDER: Record<Exclude<ModelStatus, null>, number> = {
    Rumoured: 0,
    Announced: 1,
    "Limited Access": 1.4,
    Withheld: 1.5,
    Available: 2,
    Deprecated: 3,
    Retired: 4,
};

function parseDate(value: unknown): Date | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export function deriveStatusFromDates(dates: ModelDates, now: Date, hasActiveGatewayRoute = false): DerivedStatus | null {
    const retirement = parseDate(dates.retirement_date);
    if (retirement && retirement <= now && !hasActiveGatewayRoute) {
        return { status: "Retired", reason: `retirement_date ${dates.retirement_date}` };
    }

    const deprecation = parseDate(dates.deprecation_date);
    if (deprecation && deprecation <= now) {
        return { status: "Deprecated", reason: `deprecation_date ${dates.deprecation_date}` };
    }

    const release = parseDate(dates.release_date);
    if (release && release <= now) {
        return { status: "Available", reason: `release_date ${dates.release_date}` };
    }

    const announced = parseDate(dates.announced_date);
    if (announced && announced <= now) {
        return { status: "Announced", reason: `announced_date ${dates.announced_date}` };
    }

    return null;
}

export function pickStatus(current: ModelStatus, derived: DerivedStatus | null): ModelStatus {
    if (!derived) return current;
    if (
        (current === "Rumoured" || current === "Withheld" || current === "Limited Access") &&
        (derived.status === "Announced" || derived.status === "Available")
    ) {
        return current;
    }
    const currentRank = current ? STATUS_ORDER[current] ?? -1 : -1;
    const derivedRank = STATUS_ORDER[derived.status];
    return derivedRank > currentRank ? derived.status : current;
}
