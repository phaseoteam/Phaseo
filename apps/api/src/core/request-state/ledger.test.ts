import { describe, expect, it } from "vitest";
import { RequestLedger, type LedgerEvent, type StateStore } from "./ledger";

function harness() {
    const rows = new Map<string, unknown>();
    const store: StateStore = {
        get: <T>(key: string) => structuredClone(rows.get(key)) as T | undefined,
        put: (key, value) => { rows.set(key, structuredClone(value)); },
    };
    const ledger = new RequestLedger(store);
    const opening = { workspaceId: "staging:workspace", allocationId: "test", mode: "synthetic" as const, balanceNanos: 1000 };
    ledger.initialize(opening);
    return { ledger, store, rows, opening };
}

describe("request-state accounting", () => {
    it("charges ordinary inference once without consuming another request's hold", () => {
        const { ledger } = harness();
        ledger.reserve({ id: "video", keyId: "key", kind: "hold", amountNanos: 800 });
        expect(ledger.charge("text", 150).applied).toBe(true);
        expect(ledger.charge("text", 150).alreadyApplied).toBe(true);
        expect(ledger.charge("next-text", 51).status).toBe("insufficient_funds");
        expect(() => ledger.charge("text", 151)).toThrow("charge_idempotency_conflict");
        expect(ledger.wallet()).toMatchObject({ balanceNanos: 850, reservedNanos: 800, sequence: 2 });
    });
    it("reserves and settles once, releasing the unused portion", () => {
        const { ledger, rows } = harness();
        const reservation = { id: "request", keyId: "key", kind: "inference" as const, amountNanos: 600 };
        expect(ledger.reserve(reservation).applied).toBe(true);
        expect(ledger.reserve(reservation).alreadyApplied).toBe(true);
        expect(ledger.settle("request", 250).afterBalanceNanos).toBe(750);
        expect(ledger.settle("request", 250).alreadyApplied).toBe(true);
        expect(ledger.wallet().reservedNanos).toBe(0);
        expect(ledger.wallet().sequence).toBe(2);
        const events = [...rows.entries()].filter(([key]) => key.startsWith("outbox:")).map(([, value]) => value as LedgerEvent);
        expect(events.map(event => event.reservation.status)).toEqual(["held", "captured"]);
        expect(ledger.reserve(reservation).status).toBe("captured");
    });

    it("preserves a long-lived hold across a reconstructed engine", () => {
        const { ledger, store } = harness();
        ledger.reserve({ id: "video", keyId: "key", kind: "hold", amountNanos: 800 });
        const restarted = new RequestLedger(store);
        expect(restarted.reserve({ id: "other", keyId: "key", kind: "inference", amountNanos: 300 }).status).toBe("insufficient_funds");
        expect(restarted.capture("video").afterBalanceNanos).toBe(200);
        expect(restarted.capture("video").alreadyApplied).toBe(true);
        expect(() => restarted.release("video")).toThrow("reservation_already_captured");
    });

    it("does not reset credit when an allocation or request is replayed", () => {
        const { ledger, opening } = harness();
        ledger.reserve({ id: "request", keyId: "key", kind: "inference", amountNanos: 600 });
        ledger.settle("request", 500);
        expect(ledger.initialize(opening).balanceNanos).toBe(500);
        expect(() => ledger.initialize({ ...opening, balanceNanos: 2000 })).toThrow("allocation_idempotency_conflict");
        expect(() => ledger.reserve({ id: "request", keyId: "other", kind: "hold", amountNanos: 600 })).toThrow("reservation_idempotency_conflict");
        expect(() => ledger.settle("request", 501)).toThrow("settlement_idempotency_conflict");
    });

    it("releases cancelled holds exactly once and rejects subsequent captures", () => {
        const { ledger } = harness();
        ledger.reserve({ id: "batch", keyId: "key", kind: "hold", amountNanos: 900, requestCount: 50 });
        expect(ledger.release("batch").applied).toBe(true);
        expect(ledger.release("batch").alreadyApplied).toBe(true);
        expect(ledger.wallet()).toMatchObject({ balanceNanos: 1000, reservedNanos: 0 });
        expect(() => ledger.capture("batch")).toThrow("reservation_already_released");
    });

    it("refuses to settle beyond a hold or into another request's allocation", () => {
        const { ledger } = harness();
        ledger.reserve({ id: "a", keyId: "key", kind: "hold", amountNanos: 300 });
        ledger.reserve({ id: "b", keyId: "key", kind: "hold", amountNanos: 700 });
        expect(ledger.settle("a", 301).status).toBe("reservation_exceeded");
        expect(ledger.wallet()).toMatchObject({ balanceNanos: 1000, reservedNanos: 1000, sequence: 2 });
        expect(ledger.settle("missing", 10).status).toBe("not_found");
    });

    it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid nanos: %s", amountNanos => {
        const { ledger } = harness();
        expect(() => ledger.reserve({ id: "bad", keyId: "key", kind: "hold", amountNanos })).toThrow("invalid_nanos");
        expect(ledger.wallet().sequence).toBe(0);
    });

    it("admits only available credit across many sequentially serialized callers", () => {
        const { ledger } = harness();
        const results = Array.from({ length: 100 }, (_, i) => ledger.reserve({ id: `r${i}`, keyId: "key", kind: "hold", amountNanos: 100 }));
        expect(results.filter(r => r.applied)).toHaveLength(10);
        expect(ledger.wallet().reservedNanos).toBe(1000);
    });
});
