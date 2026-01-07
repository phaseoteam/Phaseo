export type StrictnessMode = "off" | "warn" | "error";

const HEADER_KEY = "x-aistats-strictness";

export function parseStrictness(headers: Headers): StrictnessMode {
    const raw = headers.get(HEADER_KEY) ?? headers.get(HEADER_KEY.toUpperCase());
    if (!raw) return "warn";
    const normalized = raw.trim().toLowerCase();
    if (normalized === "off" || normalized === "warn" || normalized === "error") {
        return normalized;
    }
    return "warn";
}
