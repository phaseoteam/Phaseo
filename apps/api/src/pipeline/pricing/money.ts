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

type DecimalFraction = { num: bigint; den: bigint };

/** Parses a decimal or exponent string into an exact fraction (num / den, den a power of ten). */
function parseDecimalFraction(raw: string | number): DecimalFraction | null {
    let text = String(raw).trim();
    if (!text) return null;
    let negative = false;
    if (text.startsWith("-") || text.startsWith("+")) {
        negative = text.startsWith("-");
        text = text.slice(1);
    }
    const match = /^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
    if (!match || (!match[1] && !match[2])) return null;
    const whole = match[1] || "0";
    const frac = match[2] ?? "";
    const exponent = Number(match[3] ?? 0);
    let num = BigInt(whole + frac);
    let scale = frac.length - exponent;
    if (scale < 0) {
        num *= 10n ** BigInt(-scale);
        scale = 0;
    }
    return { num: negative ? -num : num, den: 10n ** BigInt(scale) };
}

/**
 * Exact cost in nanos of `quantity` at `pricePerUnit` USD per `unitSize` units, rounded
 * half up once. Catalogue prices are stored with sub-nano precision (numeric(30,12)
 * nanos), so the unit price must not be truncated to whole nanos before multiplying.
 * Returns null when an input is not a finite decimal.
 */
export function priceLineNanosExact(quantity: number, unitSize: number, pricePerUnit: string | number): number | null {
    if (!Number.isFinite(quantity) || !Number.isFinite(unitSize) || unitSize <= 0) return null;
    const qty = parseDecimalFraction(String(quantity));
    const unit = parseDecimalFraction(String(unitSize));
    const usd = parseDecimalFraction(pricePerUnit);
    if (!qty || !unit || !usd || unit.num <= 0n) return null;
    const num = qty.num * usd.num * BigInt(NANOS_PER_USD) * unit.den;
    const den = qty.den * usd.den * unit.num;
    const negative = num < 0n;
    const abs = negative ? -num : num;
    const quotient = abs / den;
    const rounded = (abs % den) * 2n >= den ? quotient + 1n : quotient;
    const nanos = Number(negative ? -rounded : rounded);
    return Number.isFinite(nanos) ? nanos : null;
}

/** The unit price as a USD decimal string, keeping digits below a nano when the catalogue has them. */
export function formatUsdPriceExact(pricePerUnit: string | number): string {
    const parsed = parseDecimalFraction(pricePerUnit);
    if (!parsed) return formatUsdFromNanosExact(parseUsdToNanos(pricePerUnit));
    const decimals = parsed.den.toString().length - 1;
    if (decimals <= 9) return formatUsdFromNanosExact(parseUsdToNanos(pricePerUnit));
    const negative = parsed.num < 0n;
    const digits = (negative ? -parsed.num : parsed.num).toString().padStart(decimals + 1, "0");
    const whole = digits.slice(0, digits.length - decimals);
    const frac = digits.slice(digits.length - decimals).replace(/0+$/, "").padEnd(9, "0");
    return `${negative ? "-" : ""}${whole}.${frac}`;
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

