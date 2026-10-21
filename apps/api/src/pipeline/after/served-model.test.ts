import { describe, expect, it } from "vitest";
import { withServedModel } from "./served-model";

const fallbackCtx = {
	model: "openai/gpt-oss-120b",
	routingDiagnostics: { modelFallback: { source: "request", primaryModel: "anthropic/claude-sonnet-4-6", attempt: 1 } },
};

describe("withServedModel", () => {
	it("names the fallback model that served a buffered response", () => {
		expect(withServedModel({ object: "chat.completion", model: "gpt-oss-120b-provider-echo" }, fallbackCtx)).toEqual({
			object: "chat.completion",
			model: "openai/gpt-oss-120b",
		});
	});

	it("rewrites Responses and Messages stream frames without mutating the nested object", () => {
		const response = { id: "resp_1", model: "echo" };
		const frame = withServedModel({ type: "response.created", response }, fallbackCtx);
		expect(frame.response.model).toBe("openai/gpt-oss-120b");
		expect(response.model).toBe("echo");
		expect(withServedModel({ type: "message_start", message: { model: "echo" } }, fallbackCtx).message.model).toBe("openai/gpt-oss-120b");
	});

	it("leaves responses alone when no model fallback served the request", () => {
		const payload = { model: "provider-echo" };
		expect(withServedModel(payload, { model: "openai/gpt-oss-120b", routingDiagnostics: {} })).toEqual({ model: "provider-echo" });
	});

	it("does not add a model field to frames that have none", () => {
		expect(withServedModel({ type: "response.output_text.delta", delta: "hi" }, fallbackCtx)).toEqual({ type: "response.output_text.delta", delta: "hi" });
	});
});
