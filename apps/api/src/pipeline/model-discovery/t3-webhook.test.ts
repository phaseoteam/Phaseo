import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../tests/helpers/runtime";
import { buildT3ModelDiscoveryEvent, forwardToT3Webhook, readT3WebhookUrl } from "./t3-webhook";

const event = () => buildT3ModelDiscoveryEvent({ event: "model_discovery.changes", text: "z-ai: added glm-5.4", now: new Date(0) });

describe("T3 webhook forwarding", () => {
	afterEach(() => teardownTestRuntime());

	it("does nothing without a configured https URL", async () => {
		setupRuntimeFromEnv({ MODEL_DISCOVERY_T3_WEBHOOK_URL: "http://insecure.example/hook" } as never);
		const request = vi.fn();
		expect(readT3WebhookUrl()).toBeNull();
		expect(await forwardToT3Webhook(event(), request as never)).toEqual({ sent: false });
		expect(request).not.toHaveBeenCalled();
	});

	describe("with a URL", () => {
		beforeEach(() => setupRuntimeFromEnv({ MODEL_DISCOVERY_T3_WEBHOOK_URL: "https://t3.example/hooks/abc" } as never));

		it("posts the event as JSON", async () => {
			const request = vi.fn(async () => new Response(null, { status: 202 }));
			expect(await forwardToT3Webhook(event(), request as never)).toEqual({ sent: true });
			const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
			expect(url).toBe("https://t3.example/hooks/abc");
			expect(JSON.parse(String(init.body))).toMatchObject({
				event: "model_discovery.changes",
				text: "z-ai: added glm-5.4",
				sentAt: "1970-01-01T00:00:00.000Z",
			});
		});

		it("reports a failed response without throwing", async () => {
			const request = vi.fn(async () => new Response("nope", { status: 500 }));
			const result = await forwardToT3Webhook(event(), request as never);
			expect(result).toEqual({ sent: false, error: "HTTP 500: nope" });
		});

		it("reports a network error without throwing", async () => {
			const request = vi.fn(async () => {
				throw new Error("offline");
			});
			expect(await forwardToT3Webhook(event(), request as never)).toEqual({ sent: false, error: "offline" });
		});
	});

	it("drops structured data that is too large but keeps the text", () => {
		const built = buildT3ModelDiscoveryEvent({
			event: "model_discovery.changes",
			text: "big",
			data: { blob: "x".repeat(250_000) },
		});
		expect(built.data).toBeNull();
		expect(built.text).toBe("big");
	});
});
