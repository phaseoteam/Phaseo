import { describe, expect, it, vi } from "vitest";
import { sendSlackWebhookMessage, validateSlackWebhookUrl } from "./slack";

describe("model discovery Slack webhook", () => {
	it("accepts Slack incoming webhook URLs only", () => {
		expect(validateSlackWebhookUrl("https://hooks.slack.com/services/T000/B000/example").hostname).toBe("hooks.slack.com");
		expect(() => validateSlackWebhookUrl("https://example.com/services/T000/B000/example")).toThrow(/host is not allowed/i);
	});

	it("sends a text payload", async () => {
		const request = vi.fn(async () => new Response("ok", { status: 200 }));
		await sendSlackWebhookMessage("https://hooks.slack.com/services/T000/B000/example", "Model found", request);
		expect(request).toHaveBeenCalledWith(
			"https://hooks.slack.com/services/T000/B000/example",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ text: "Model found" }),
			}),
		);
	});
});
