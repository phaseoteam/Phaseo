import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = readFileSync(new URL("../../wrangler.staging.toml", import.meta.url), "utf8");

describe("staging routing isolation and cost bounds", () => {
    it("keeps shared database publication and scheduled consumers disabled", () => {
        expect(config).toMatch(/^name = "phaseo-gateway-staging"$/m);
        expect(config).toMatch(/^crons = \[\]$/m);
        expect(config).toMatch(/^GATEWAY_WORKSPACE_PUBLICATION_ENABLED = "false"$/m);
    });
    it("binds recovery only to staging queues with bounded delivery", () => {
        const consumers = config.split("[[queues.consumers]]").slice(1).map(section => section.split("[[")[0]);
        expect(consumers).toHaveLength(1);
        expect(consumers[0]).toContain('queue = "phaseo-gateway-staging-settlement-recovery"');
        expect(consumers[0]).toContain('dead_letter_queue = "phaseo-gateway-staging-settlement-dead-letter"');
        expect(consumers[0]).toMatch(/^max_batch_size = 1$/m);
        expect(consumers[0]).toMatch(/^max_concurrency = 1$/m);
        expect(consumers[0]).toMatch(/^max_retries = 5$/m);
        // Dead letters are retained for inspection, never automatically replayed.
        expect(consumers[0]).not.toMatch(/^queue = ".*-dead-letter"$/m);
        expect(config).toContain('binding = "SETTLEMENT_RECOVERY_QUEUE"');
        expect(config).toContain('binding = "SETTLEMENT_RECOVERY_DEAD_LETTER"');
    });
    it("provisions a SQLite owner quota and local burst guard", () => {
        expect(config).toContain('GATEWAY_FREE_MODEL_QUOTA_ENABLED = "true"');
        expect(config).toContain('new_sqlite_classes = ["FreeModelQuotaDurableObject"]');
        expect(config).toContain('name = "FREE_MODEL_QUOTA"');
        expect(config).toMatch(/name = "FREE_MODEL_RATE_LIMITER"\s+namespace_id = "41004"\s+\[ratelimits.simple\]\s+limit = 25\s+period = 60/);
    });
});
