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

	it.each([
		["openai/gpt-6-luna", "gpt-6-luna"],
		["anthropic/claude-sonnet-5.5", "claude-sonnet-5-5"],
		["deepseek/deepseek-v4.1-flash-1017", "deepseek-ai/DeepSeek-V4.1-Flash-1017"],
	])("names %s instead of the provider's %s without a fallback", (model, echo) => {
		const ctx = { model, routingDiagnostics: {} };
		expect(withServedModel({ object: "chat.completion.chunk", model: echo }, ctx).model).toBe(model);
		expect(withServedModel({ type: "response.completed", response: { model: echo } }, ctx).response.model).toBe(model);
		expect(withServedModel({ type: "message_start", message: { model: echo } }, ctx).message.model).toBe(model);
	});

	it("names the request's model even when it has no organisation prefix", () => {
		expect(withServedModel({ model: "provider-echo" }, { model: "phaseo-internal-model", routingDiagnostics: {} })).toEqual({ model: "phaseo-internal-model" });
	});

	it("keeps the payload's model only when the context has none", () => {
		expect(withServedModel({ model: "provider-echo" }, { model: "", routingDiagnostics: {} })).toEqual({ model: "provider-echo" });
	});

	it("does not add a model field to frames that have none", () => {
		expect(withServedModel({ type: "response.output_text.delta", delta: "hi" }, fallbackCtx)).toEqual({ type: "response.output_text.delta", delta: "hi" });
	});
});
