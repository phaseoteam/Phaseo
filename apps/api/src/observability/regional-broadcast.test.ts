import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const config = (name: string) => readFileSync(join(__dirname, "..", "..", name), "utf8");

describe("regional gateway workers", () => {
	for (const name of ["wrangler.eu.toml", "wrangler.us.toml"]) {
		it(`${name} sends Broadcast events to the shared queue`, () => {
			const toml = config(name);
			expect(toml).toMatch(/^OTEL_EXPORT_ENABLED = "true"$/m);
			expect(toml).toMatch(/^BROADCAST_QUEUE_ENABLED = "true"$/m);
			expect(toml).toMatch(/\[\[queues\.producers\]\]\s+binding = "BROADCAST_QUEUE"\s+queue = "phaseo-broadcast"/);
			// Only phaseo-gateway consumes the queue.
			expect(toml).not.toContain("[[queues.consumers]]");
		});

		it(`${name} still has no I/O log bucket, so nothing is stored there`, () => {
			expect(config(name)).not.toMatch(/binding = "GATEWAY_IO_LOGS_BUCKET"/);
		});
	}

	it("uses the queue phaseo-gateway consumes", () => {
		expect(config("wrangler.toml")).toMatch(/\[\[queues\.consumers\]\]\s+queue = "phaseo-broadcast"/);
	});
});
