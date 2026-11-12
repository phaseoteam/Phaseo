const DAY_MS = 86_400_000;
const NANOS_PER_USD = 1_000_000_000;
/** Below a cent a day the projection is noise (the website's rule). */
const MIN_DAILY_NANOS = NANOS_PER_USD / 100;
export const RUNWAY_MAX_DAYS = 90;

export type CreditRunway =
  | { kind: "auto_top_up"; at: number; dailyUsd: number }
  | { kind: "runs_out"; at: number; dailyUsd: number }
  | { kind: "beyond"; days: number; dailyUsd: number };

/**
 * When the balance reaches the auto top-up threshold (or zero without auto top-up) at the recent daily pace: the
 * website's projectCreditRunway, so both say the same date.
 */
export function projectCreditRunway(args: { balanceNanos: number; dailyNanos: number; observedAt: number; autoTopUpEnabled: boolean; autoTopUpThresholdNanos: number }): CreditRunway | null {
  if (!(args.dailyNanos >= MIN_DAILY_NANOS) || !(args.balanceNanos > 0)) return null;
  const dailyUsd = args.dailyNanos / NANOS_PER_USD;
  const floor = args.autoTopUpEnabled ? Math.max(0, args.autoTopUpThresholdNanos) : 0;
  if (args.balanceNanos <= floor) return null;
  const days = (args.balanceNanos - floor) / args.dailyNanos;
  if (days > RUNWAY_MAX_DAYS) return { kind: "beyond", days: RUNWAY_MAX_DAYS, dailyUsd };
  return { kind: args.autoTopUpEnabled ? "auto_top_up" : "runs_out", at: Math.round(args.observedAt + days * DAY_MS), dailyUsd };
}

/** The website's names for ledger entries (getCreditTransactionKindLabel), in sentence case. */
export function transactionLabel(kind: string | null | undefined, description?: string | null): string {
  const value = String(kind ?? "").toLowerCase();
  const labels: Record<string, string> = {
    promo_code: "Promo credit",
    goodwill_credit: "Goodwill credit",
    top_up_one_off: "One-off top-up",
    top_up: "Top-up",
    auto_top_up: "Auto top-up",
    refund: "Refund",
    refunded: "Refund",
    adjustment: "Adjustment",
    charge: "Usage",
    usage: "Usage",
  };
  if (labels[value]) return labels[value];
  // Entries without a kind are named after what they point at; a Stripe payment is a card top-up.
  if (!value && /^stripe_payment_intent/i.test(String(description ?? ""))) return "Top-up";
  const text = (value || String(description ?? "").replace(/:.*$/, "")).toLowerCase().replace(/[_:]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Credit";
}

/** "Paid", "Pending", "Failed"…: a ledger status for display, or null when it adds nothing. */
export function transactionStatus(status: string | null | undefined): string | null {
  const value = String(status ?? "").toLowerCase();
  if (!value || value === "succeeded" || value === "paid" || value === "posted" || value === "completed") return null;
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}
