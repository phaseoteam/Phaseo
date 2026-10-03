import { describe, expect, it, vi } from "vitest";
import { elicitationForm, respondMcpElicitation } from "./mcpElicitation";
const request = { serverName: "Fixture", message: "Choose scope", mode: "form", requestedSchema: { type: "object", properties: { count: { type: "integer", minimum: 1, maximum: 5, default: 2 }, name: { type: "string", enum: ["small", "large"] }, confirm: { type: "boolean" } }, required: ["count"] } };

describe("MCP elicitation", () => {
	it("maps titled choices and bounded multiple selections", () => {
		const form = elicitationForm({ ...request, requestedSchema: { type: "object", properties: { choice: { type: "string", oneOf: [{ const: "a", title: "A" }] }, selections: { type: "array", minItems: 1, maxItems: 2, items: { type: "string", anyOf: [{ const: "b", title: "B" }] } } } } });
		expect(form.fields).toEqual([expect.objectContaining({ type: "string", options: [{ value: "a", label: "A" }], custom: false }), expect.objectContaining({ type: "multiselect", options: [{ value: "b", label: "B" }], minItems: 1, maxItems: 2, custom: false })]);
	});
	it("maps primitive schemas and validates answers before accepting", async () => {
		expect(elicitationForm(request).fields[0]).toMatchObject({ key: "count", type: "integer", required: true, minimum: 1, maximum: 5, default: 2 });
		const callbacks = { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" as const, onForm: vi.fn().mockResolvedValueOnce({ count: 3 }).mockResolvedValueOnce({ count: 0 }) };
		expect(await respondMcpElicitation(request, callbacks, new AbortController().signal)).toEqual({ action: "accept", content: { count: 3 } });
		expect(await respondMcpElicitation(request, callbacks, new AbortController().signal)).toEqual({ action: "decline" });
	});
	it("declines unsupported schemas without displaying a misleading form", async () => {
		const callbacks = { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" as const, onForm: vi.fn() };
		expect(await respondMcpElicitation({ ...request, requestedSchema: { type: "object", properties: { name: { type: "string", pattern: "unsafe" } } } }, callbacks, new AbortController().signal)).toEqual({ action: "decline" }); expect(callbacks.onForm).not.toHaveBeenCalled();
	});
	it("requires explicit external confirmation and omits form content from URL replies", async () => {
		const callbacks = { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" as const, onForm: vi.fn().mockResolvedValue({ confirmation: true }) };
		expect(await respondMcpElicitation({ serverName: "Fixture", message: "Sign in", mode: "url", url: "https://example.com/auth" }, callbacks, new AbortController().signal)).toEqual({ action: "accept" });
		expect(() => elicitationForm({ ...request, mode: "url", url: "file:///private" })).toThrow();
	});
	it("cancels pending responses when the provider aborts", async () => {
		const controller = new AbortController(); const callbacks = { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" as const, onForm: async () => { controller.abort(); return { count: 3 }; } };
		expect(await respondMcpElicitation(request, callbacks, controller.signal)).toEqual({ action: "cancel" });
	});
});
