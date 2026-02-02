// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

// Fixed-point helpers (USD nanos using numbers — no BigInt to keep outputs JSON-friendly)
const NANOS_PER_USD = 1_000_000_000;
const NANOS_PER_CENT = 10_000_000;

export function parseUsdToNanos(x: string | number): number {
    const s = String(x).trim();
    if (!s) return 0;
    if (/e/i.test(s)) {
        const num = Number(s);
        if (!Number.isFinite(num)) return 0;
        return Math.round(num * NANOS_PER_USD);
    }
    const neg = s.startsWith("-");
    const clean = neg ? s.slice(1) : s;
    const [i, fRaw = ""] = clean.split(".");
    const f = (fRaw + "000000000").slice(0, 9);
    const val = Number(i || "0") * NANOS_PER_USD + Number(f || "0");
    return neg ? -val : val;
}

export function nanosToCentsCeil(n: number): number {
    return Math.ceil(n / NANOS_PER_CENT);
}

export function formatUsdFromNanosTrunc(nanos: number, dp = 6): number {
    const neg = nanos < 0 ? "-" : "";
    const abs = Math.abs(nanos);
    const dollars = Math.trunc(abs / NANOS_PER_USD);
    const frac9 = String(abs % NANOS_PER_USD).padStart(9, "0");
    if (dp <= 0) return Number(`${neg}${dollars}`);
    const frac = frac9.slice(0, Math.min(9, dp)).padEnd(dp, "0");
    return Number(`${neg}${dollars}.${frac}`);
}

export function formatUsdFromNanosExact(nanos: number, dp = 9): string {
    const neg = nanos < 0 ? "-" : "";
    const abs = Math.abs(nanos);
    const dollars = Math.trunc(abs / NANOS_PER_USD);
    if (dp <= 0) return `${neg}${dollars}`;
    const frac9 = String(abs % NANOS_PER_USD).padStart(9, "0");
    const frac = frac9.slice(0, Math.min(9, dp)).padEnd(dp, "0");
    return `${neg}${dollars}.${frac}`;
}

