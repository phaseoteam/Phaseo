// Purpose: Core gateway primitives.
// Why: Shared types/schemas/utilities used across modules.
// How: Exposes reusable building blocks for the gateway.

export type EdgeMeta = {
    colo: string | null;
    city: string | null;
    country: string | null;
    continent: string | null;
    asn: number | null;
};

export function getEdgeMeta(req: Request): EdgeMeta {
    const anyReq = req as any;
    const cf = (anyReq?.cf ?? {}) as Record<string, any>;
    const asnValue = cf?.asn;
    const asn = typeof asnValue === "number"
        ? asnValue
        : (typeof asnValue === "string" && Number.isFinite(Number(asnValue)) ? Number(asnValue) : null);

    return {
        colo: typeof cf?.colo === "string" ? cf.colo : null,
        city: typeof cf?.city === "string" ? cf.city : null,
        country: typeof cf?.country === "string" ? cf.country : null,
        continent: typeof cf?.continent === "string" ? cf.continent : null,
        asn,
    };
}

