import { describe, expect, it, vi } from "vitest";
import { elicitationForm, mcpApprovalRequest, respondMcpElicitation, withoutNulls } from "./mcpElicitation";
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
	it("tells declining apart from cancelling", async () => {
		const callbacks = { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" as const, onForm: vi.fn().mockResolvedValueOnce("decline").mockResolvedValueOnce(null) };
		expect(await respondMcpElicitation(request, callbacks, new AbortController().signal)).toEqual({ action: "decline" });
		expect(await respondMcpElicitation(request, callbacks, new AbortController().signal)).toEqual({ action: "cancel" });
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
	it("asks primitive forms in the answer panel, naming the server, and falls back to the form when an answer does not fit", async () => {
		const onQuestion = vi.fn().mockResolvedValueOnce({ count: ["3"], name: ["large"], confirm: ["true"] }).mockResolvedValueOnce({}).mockResolvedValueOnce({ count: ["9"] });
		const onForm = vi.fn().mockResolvedValue(null);
		const callbacks = { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" as const, onQuestion, onForm };
		expect(await respondMcpElicitation(request, callbacks, new AbortController().signal)).toEqual({ action: "accept", content: { count: 3, name: "large", confirm: true } });
		expect(onQuestion).toHaveBeenCalledWith([
			expect.objectContaining({ id: "count", question: "Choose scope", isOther: true, input: { kind: "integer", min: 1, max: 5 } }),
			expect.objectContaining({ id: "name", required: false, options: [{ label: "small", value: "small" }, { label: "large", value: "large" }] }),
			expect.objectContaining({ id: "confirm", required: false, input: { kind: "boolean" } }),
		], expect.objectContaining({ origin: "Fixture" }));
		expect(await respondMcpElicitation(request, callbacks, new AbortController().signal)).toEqual({ action: "cancel" });
		expect(await respondMcpElicitation(request, callbacks, new AbortController().signal)).toEqual({ action: "cancel" });
		expect(onForm).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("integer") }), expect.anything());
	});
	it("reads ACP schemas, which mark absent values with null and carry _meta", () => {
		const schema = withoutNulls({ type: "object", title: null, _meta: { x: 1 }, properties: { pick: { type: "string", oneOf: [{ const: "a", title: "A", description: "First", _meta: null }], minLength: null } }, required: null });
		expect(elicitationForm({ serverName: "Agent", message: "Pick", mode: "form", requestedSchema: schema }).fields).toEqual([expect.objectContaining({ key: "pick", options: [{ value: "a", label: "A", description: "First" }] })]);
	});
	it("routes Codex tool-call approvals to the approval card with lasting grants where offered", () => {
		expect(mcpApprovalRequest(request)).toBeUndefined();
		const approval = mcpApprovalRequest({ serverName: "github", message: "Allow ChatGPT to use GitHub?", mode: "form", requestedSchema: { type: "object", properties: {} }, _meta: { codex_approval_kind: "mcp_tool_call", app_name: "GitHub", persist: ["session", "always"] } })!;
		expect(approval).toMatchObject({ title: "Allow GitHub?", description: "Allow ChatGPT to use GitHub?", always: "Allow for this session" });
		expect(approval.response("accept")).toEqual({ action: "accept", content: {} });
		expect(approval.response("always")).toEqual({ action: "accept", content: {}, _meta: { persist: "session" } });
		expect(approval.response("decline")).toEqual({ action: "decline" });
		const choice = mcpApprovalRequest({ serverName: "s", message: "Run?", mode: "form", requestedSchema: { type: "object", properties: { decision: { type: "string", enum: ["allow_once", "allow_always", "deny"] } }, required: ["decision"] }, _meta: { codex_approval_kind: "mcp_tool_call" } })!;
		expect(choice.always).toBe("Always allow");
		expect(choice.response("accept")).toEqual({ action: "accept", content: { decision: "allow_once" } });
		expect(choice.response("always")).toEqual({ action: "accept", content: { decision: "allow_always" }, _meta: { persist: "always" } });
		expect(mcpApprovalRequest({ serverName: "s", message: "?", mode: "form", requestedSchema: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] }, _meta: { codex_approval_kind: "mcp_tool_call" } })).toBeUndefined();
	});
	it("cancels pending responses when the provider aborts", async () => {
		const controller = new AbortController(); const callbacks = { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" as const, onForm: async () => { controller.abort(); return { count: 3 }; } };
		expect(await respondMcpElicitation(request, callbacks, controller.signal)).toEqual({ action: "cancel" });
	});
});
