export type OgEntity = "organisations" | "models" | "benchmarks" | "api-providers" | "countries" | "subscription-plans";
export type OgStat = { label: string; value: string; helper?: string };
export type OgPayload = { id: string; name: string; logoId?: string; subtitle?: string; badge?: string; stats?: OgStat[]; flagEmoji?: string };
