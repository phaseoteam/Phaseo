import { projectCreditRunway, transactionLabel, transactionStatus } from "./credits";

const usd = (value: number) => value * 1_000_000_000;

describe("credit runway", () => {
  const observedAt = Date.UTC(2026, 9, 19);

  test("projects when credits run out at the recent pace", () => {
    expect(projectCreditRunway({ balanceNanos: usd(10), dailyNanos: usd(2), observedAt, autoTopUpEnabled: false, autoTopUpThresholdNanos: 0 })).toEqual({ kind: "runs_out", at: observedAt + 5 * 86_400_000, dailyUsd: 2 });
  });

  test("with auto top-up, projects when the threshold is reached", () => {
    expect(projectCreditRunway({ balanceNanos: usd(10), dailyNanos: usd(2), observedAt, autoTopUpEnabled: true, autoTopUpThresholdNanos: usd(4) })).toEqual({ kind: "auto_top_up", at: observedAt + 3 * 86_400_000, dailyUsd: 2 });
  });

  test("says nothing for tiny spend or an empty balance, and caps long runways", () => {
    expect(projectCreditRunway({ balanceNanos: usd(10), dailyNanos: usd(0.001), observedAt, autoTopUpEnabled: false, autoTopUpThresholdNanos: 0 })).toBeNull();
    expect(projectCreditRunway({ balanceNanos: 0, dailyNanos: usd(1), observedAt, autoTopUpEnabled: false, autoTopUpThresholdNanos: 0 })).toBeNull();
    expect(projectCreditRunway({ balanceNanos: usd(500), dailyNanos: usd(1), observedAt, autoTopUpEnabled: false, autoTopUpThresholdNanos: 0 })).toEqual({ kind: "beyond", days: 90, dailyUsd: 1 });
  });
});

describe("transactions", () => {
  test("use the website's names", () => {
    expect(["top_up", "auto_top_up", "promo_code", "refunded", "adjustment"].map((kind) => transactionLabel(kind))).toEqual(["Top-up", "Auto top-up", "Promo credit", "Refund", "Adjustment"]);
    expect(transactionLabel(null, "Stripe_Payment_Intent:pi_1")).toBe("Top-up");
    expect(transactionLabel(null, "Feedback_Request:abc")).toBe("Feedback request");
    expect(transactionLabel("feedback_reward")).toBe("Feedback reward");
  });

  test("only unusual statuses are shown", () => {
    expect(transactionStatus("succeeded")).toBeNull();
    expect(transactionStatus("pending")).toBe("Pending");
    expect(transactionStatus("requires_action")).toBe("Requires action");
  });
});
