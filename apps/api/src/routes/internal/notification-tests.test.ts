import { beforeEach, describe, expect, it, vi } from "vitest";

const deliverNotificationTestMock = vi.fn();
const configureRuntimeMock = vi.fn();
const clearRuntimeMock = vi.fn();

vi.mock("@/pipeline/notifications/notification-delivery", () => ({
	deliverNotificationTest: (...args: unknown[]) => deliverNotificationTestMock(...args),
}));

const sendSpendRuleTestMock = vi.fn();
let sendSpendRuleTestFailure: Error | null = null;
vi.mock("@/pipeline/notifications/spend-rule-test", () => {
	class SpendRuleTestError extends Error {
		constructor(readonly status: number, readonly code: string, message: string, readonly retryAfterSeconds?: number) { super(message); }
	}
	return { SpendRuleTestError, sendSpendRuleTest: async (...args: unknown[]) => {
		if (sendSpendRuleTestFailure) throw sendSpendRuleTestFailure;
		return sendSpendRuleTestMock(...args);
	} };
});

vi.mock("@/runtime/env", () => ({
	configureRuntime: (...args: unknown[]) => configureRuntimeMock(...args),
	clearRuntime: (...args: unknown[]) => clearRuntimeMock(...args),
}));

import { internalNotificationTestRoutes } from "./notification-tests";

describe("internal notification tests", () => {
	beforeEach(() => {
		deliverNotificationTestMock.mockReset().mockResolvedValue(204);
		configureRuntimeMock.mockReset();
		clearRuntimeMock.mockReset();
	});

	it("requires the internal bearer token", async () => {
		const response = await internalNotificationTestRoutes.request("/", { method: "POST" }, { GATEWAY_INTERNAL_TEST_TOKEN: "secret" } as never);
		expect(response.status).toBe(401);
		expect(configureRuntimeMock).not.toHaveBeenCalled();
	});

	it("configures and clears runtime around synchronous delivery", async () => {
		const token = "notification-test-token-at-least-32-bytes";
		const env = { GATEWAY_INTERNAL_TEST_TOKEN: token } as never;
		const response = await internalNotificationTestRoutes.request("/", {
			method: "POST",
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", destinationId: "destination-1" }),
		}, env);
		expect(response.status).toBe(200);
		expect(deliverNotificationTestMock).toHaveBeenCalledWith({ workspaceId: "workspace-1", destinationId: "destination-1" });
		expect(configureRuntimeMock).toHaveBeenCalledWith(env);
		expect(clearRuntimeMock).toHaveBeenCalledOnce();
	});

	it("rejects unsupported notification kinds before delivery", async () => {
		const token = "notification-test-token-at-least-32-bytes";
		const response = await internalNotificationTestRoutes.request("/", {
			method: "POST",
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", kind: "other" }),
		}, { GATEWAY_INTERNAL_TEST_TOKEN: token } as never);
		expect(response.status).toBe(400);
		expect(deliverNotificationTestMock).not.toHaveBeenCalled();
	});

	describe("spend rule test sends", () => {
		const token = "notification-test-token-at-least-32-bytes";
		const workspaceId = "00000000-0000-4000-8000-000000000001";
		const ruleId = "00000000-0000-4000-8000-000000000002";
		const post = (body: unknown, auth = `Bearer ${token}`) => internalNotificationTestRoutes.request("/spend-rule", {
			method: "POST",
			headers: { authorization: auth, "content-type": "application/json" },
			body: JSON.stringify(body),
		}, { GATEWAY_INTERNAL_TEST_TOKEN: token } as never);

		beforeEach(() => {
			sendSpendRuleTestMock.mockReset();
			sendSpendRuleTestFailure = null;
		});

		it("requires the internal token and uuids", async () => {
			expect((await post({ workspaceId, ruleId }, "Bearer wrong")).status).toBe(401);
			expect((await post({ workspaceId, ruleId: "x" })).status).toBe(400);
			expect(sendSpendRuleTestMock).not.toHaveBeenCalled();
		});

		it("sends the test with the runtime configured", async () => {
			sendSpendRuleTestMock.mockResolvedValue({ rule_id: ruleId, delivered: 1 });
			const response = await post({ workspaceId, ruleId: ruleId.toUpperCase() });
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ ok: true, result: { rule_id: ruleId, delivered: 1 } });
			expect(sendSpendRuleTestMock).toHaveBeenCalledWith({ workspaceId, ruleId });
			expect(clearRuntimeMock).toHaveBeenCalledOnce();
		});

		it("passes the limit through with Retry-After", async () => {
			const { SpendRuleTestError } = await import("@/pipeline/notifications/spend-rule-test");
			sendSpendRuleTestFailure = new SpendRuleTestError(429, "rate_limited", "limit", 12);
			const response = await post({ workspaceId, ruleId });
			expect(response.status).toBe(429);
			expect(response.headers.get("Retry-After")).toBe("12");
			expect(await response.json()).toEqual({ error: "rate_limited", message: "limit" });
		});
	});
});
