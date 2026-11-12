import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import worker, { RealtimeRelayDurableObject } from "./realtime-worker";
import { RealtimeRelayDurableObject as GatewayRelay } from "@core/realtime-relay-durable-object";

const config = (name: string) => readFileSync(join(__dirname, "..", name), "utf8");
const vars = (toml: string) => {
	const section = /^\[vars\]\n([\s\S]*?)^\[/m.exec(toml)?.[1] ?? "";
	return Object.fromEntries([...section.matchAll(/^([A-Z0-9_]+) = "([^"]*)"$/gm)].map((match) => [match[1], match[2]]));
};

describe("phaseo-realtime (the relay Worker)", () => {
	const realtime = config("wrangler.realtime.toml");

	it("runs the same relay class as the gateway, and nothing public", async () => {
		expect(RealtimeRelayDurableObject).toBe(GatewayRelay);
		expect((await worker.fetch()).status).toBe(404);
		expect(realtime).toMatch(/^name = "phaseo-realtime"$/m);
		expect(realtime).toMatch(/^main = "src\/realtime-worker\.ts"$/m);
		expect(realtime).toMatch(/\[\[durable_objects\.bindings\]\]\s+name = "REALTIME_RELAY"\s+class_name = "RealtimeRelayDurableObject"\s+\[/);
		expect(realtime).toMatch(/new_sqlite_classes = \["RealtimeRelayDurableObject"\]/);
		// Deploys go only through the realtime-relay-deploy workflow; nothing routes or schedules here.
		for (const forbidden of ["[[routes]]", "[triggers]", "[[queues.consumers]]", "workers_dev = true"]) {
			expect(realtime).not.toContain(forbidden);
		}
	});

	it("keeps every shared setting equal to phaseo-gateway's", () => {
		const gateway = vars(config("wrangler.toml"));
		const relay = vars(realtime);
		expect(Object.keys(relay).length).toBeGreaterThan(5);
		for (const [name, value] of Object.entries(relay)) expect({ name, value }).toEqual({ name, value: gateway[name] });
		const cacheId = (toml: string) => /binding = "GATEWAY_CACHE"\s+id = "([^"]+)"/.exec(toml)?.[1];
		expect(cacheId(realtime)).toBe(cacheId(config("wrangler.toml")));
	});

	it("is where phaseo-gateway and phaseo-jobs send relay connections", () => {
		for (const name of ["wrangler.toml", "wrangler.jobs.toml"]) {
			expect(config(name)).toMatch(/name = "REALTIME_RELAY"\s+class_name = "RealtimeRelayDurableObject"\s+script_name = "phaseo-realtime"/);
		}
	});

	it("reaches the gateway's other Durable Objects in phaseo-gateway", () => {
		for (const name of ["PROVIDER_RATE_LIMITS", "ROUTING_HEALTH", "CUSTOMER_RATE_LIMITS", "SPEND_LIMITS"]) {
			expect(realtime).toMatch(new RegExp(`name = "${name}"\\s+class_name = "\\w+"\\s+script_name = "phaseo-gateway"`));
		}
	});
});
