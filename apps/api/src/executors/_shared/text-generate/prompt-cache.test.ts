import { describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { withScopedPromptCacheKey } from "./prompt-cache";

const request: IRChatRequest = { model: "test", messages: [], stream: false };

describe("scoped prompt cache keys", () => {
	it.each(["openai", "openai-eu", "mistral"])("supplies a stable opaque default for %s", async (providerId) => {
		const args = { workspaceId: "workspace-private", providerId };
		const first = await withScopedPromptCacheKey(request, args, "gateway");
		const second = await withScopedPromptCacheKey({ ...request, messages: [{ role: "user", content: [{ type: "text", text: "new turn" }] }] }, args, "gateway");
		expect(first.promptCacheKey).toMatch(/^ph_[a-f0-9]{60}$/);
		expect(second.promptCacheKey).toBe(first.promptCacheKey);
		expect(first.promptCacheKey).not.toContain("workspace-private");
		expect(request.promptCacheKey).toBeUndefined();
	});

	it("isolates identical caller keys across workspaces sharing gateway credentials", async () => {
		const ir = { ...request, promptCacheKey: "session-1" };
		const first = await withScopedPromptCacheKey(ir, { workspaceId: "a", providerId: "mistral" }, "gateway");
		const second = await withScopedPromptCacheKey(ir, { workspaceId: "b", providerId: "mistral" }, "gateway");
		expect(first.promptCacheKey).not.toBe(second.promptCacheKey);
		expect(first.promptCacheKey).not.toContain("session-1");
	});

	it("preserves customer-managed explicit keys", async () => {
		const ir = { ...request, promptCacheKey: "customer-session" };
		expect(await withScopedPromptCacheKey(ir, { workspaceId: "a", providerId: "mistral" }, "byok")).toBe(ir);
	});

	it("does not invent cache controls for unrelated providers or missing workspaces", async () => {
		expect(await withScopedPromptCacheKey(request, { workspaceId: "a", providerId: "anthropic" }, "gateway")).toBe(request);
		expect(await withScopedPromptCacheKey(request, { workspaceId: "", providerId: "openai" }, "gateway")).toBe(request);
	});
});
