import { beforeEach, describe, expect, it, vi } from "vitest";

const applyResponseHealingPlugin = vi.fn();

vi.mock("./response-healing", () => ({
	applyResponseHealingPlugin,
}));

describe("applyResponsePlugins", () => {
	beforeEach(() => {
		applyResponseHealingPlugin.mockReset();
	});

	it("exposes a typed code-first response plugin registry", async () => {
		const { RESPONSE_PLUGIN_HANDLERS, getResponsePluginHandler } = await import("./registry");

		expect(RESPONSE_PLUGIN_HANDLERS).toEqual([
			expect.objectContaining({
				id: "response-healing",
				stage: "response.post_provider",
				supportsStreaming: false,
			}),
		]);
		expect(getResponsePluginHandler("response-healing")).toEqual(
			expect.objectContaining({
				id: "response-healing",
				stage: "response.post_provider",
				supportsStreaming: false,
			}),
		);
		expect(getResponsePluginHandler("missing-plugin")).toBeNull();
	});

	it("applies enabled response-healing plugins and updates the payload", async () => {
		applyResponseHealingPlugin.mockReturnValue({
			payload: { output: "healed" },
			execution: {
				id: "response-healing",
				stage: "response.post_provider",
				changed: true,
				status: "applied",
				metadata: {
					attempted: true,
					mode: "safe",
					healed: true,
				},
			},
		});

		const { applyResponsePlugins } = await import("./registry");
		const result = applyResponsePlugins({
			ctx: {
				plugins: [{ id: "response-healing", enabled: true, config: {} }],
			} as any,
			result: {} as any,
			payload: { output: "raw" },
			finishReason: "stop",
		});

		expect(result.payload).toEqual({ output: "healed" });
		expect(result.executions).toEqual([
			expect.objectContaining({
				id: "response-healing",
				status: "applied",
				changed: true,
			}),
		]);
	});

	it("skips response plugins that do not support streaming", async () => {
		const { applyResponsePlugins } = await import("./registry");
		const payload = { output: "raw" };
		const result = applyResponsePlugins({
			ctx: {
				stream: true,
				plugins: [{ id: "response-healing", enabled: true, config: {} }],
			} as any,
			result: {} as any,
			payload,
			finishReason: "stop",
		});

		expect(result.payload).toBe(payload);
		expect(applyResponseHealingPlugin).not.toHaveBeenCalled();
		expect(result.executions).toEqual([
			{
				id: "response-healing",
				stage: "response.post_provider",
				changed: false,
				status: "skipped",
				metadata: {
					attempted: false,
					reason: "streaming_unsupported",
				},
			},
		]);
	});

	it("records failed execution metadata when a response plugin throws", async () => {
		applyResponseHealingPlugin.mockImplementation(() => {
			throw new Error("Unexpected healing failure");
		});

		const { applyResponsePlugins } = await import("./registry");
		const payload = { output: "raw" };
		const result = applyResponsePlugins({
			ctx: {
				plugins: [{ id: "response-healing", enabled: true, config: {} }],
			} as any,
			result: {} as any,
			payload,
			finishReason: "stop",
		});

		expect(result.payload).toBe(payload);
		expect(result.executions).toEqual([
			{
				id: "response-healing",
				stage: "response.post_provider",
				changed: false,
				status: "failed",
				metadata: {
					attempted: true,
					mode: "safe",
					reason: "plugin_error",
					error: "Unexpected healing failure",
				},
			},
		]);
	});
});
