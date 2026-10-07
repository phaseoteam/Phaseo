import { describe, expect, it } from "vitest";
import { keyEnrichmentSchema, teamEnrichmentSchema } from "./schemas";

describe("request admission telemetry", () => {
    it("preserves unavailable historical totals as null", () => {
        const team = teamEnrichmentSchema.parse({
            tier: "basic", created_at: "2026-10-07T00:00:00Z", account_age_days: 1,
            balance_nanos: 1_000_000_000, balance_usd: 1, balance_is_low: false,
            total_requests: null, total_spend_nanos: null, total_spend_usd: null,
            spend_24h_nanos: null, spend_24h_usd: null, spend_7d_nanos: null,
            spend_7d_usd: null, spend_30d_nanos: null, spend_30d_usd: null,
            requests_1h: null, requests_24h: null,
        });
        expect(team.total_requests).toBeNull();
        expect(team.spend_24h_usd).toBeNull();
        expect(team.balance_nanos).toBe(1_000_000_000);
        const key = keyEnrichmentSchema.parse({
            name: "Test", created_at: "2026-10-07T00:00:00Z", key_age_days: 1,
            total_requests: null, total_spend_nanos: null, total_spend_usd: null,
            requests_today: null, spend_today_nanos: null, spend_today_usd: null,
            daily_limit_pct: null,
        });
        expect(key.requests_today).toBeNull();
        expect(key.total_requests).toBeNull();
    });
});
