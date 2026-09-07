import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { authorizeRealtimeSource } from "@/routes/v1/data/realtime-sessions";

vi.mock("@/runtime/env", () => ({ getBindings: () => ({ CHAT_ROUTE_KEY_SEED: "test-seed" }) }));
const workspaceId = "6108396e-0e12-425d-91ff-a02d39a346e0";
const userId = "11111111-1111-4111-8111-111111111111";
const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function kidFor(scope: string) {
	return Array.from(createHash("sha256").update(`test-seed:kid:${scope}:0`).digest()).map((byte) => alphabet[byte % 62]).join("").slice(0, 12);
}
describe("Realtime Chat identity", () => {
	it("accepts the per-user key produced by the Chat web service", async () => {
		expect(await authorizeRealtimeSource({ auth: { workspaceId, authMethod: "api_key", apiKeyKid: kidFor(`${workspaceId}:${userId}`) } as any, source: "chat", metadata: { userId } })).toBe(userId);
	});
	it("rejects another user's identity and legacy workspace-only keys", async () => {
		for (const apiKeyKid of [kidFor(workspaceId), kidFor(`${workspaceId}:22222222-2222-4222-8222-222222222222`)]) {
			await expect(authorizeRealtimeSource({ auth: { workspaceId, authMethod: "api_key", apiKeyKid } as any, source: "chat", metadata: { userId } })).rejects.toThrow("realtime_chat_source_forbidden");
		}
	});
});
