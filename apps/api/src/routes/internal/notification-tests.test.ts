import { beforeEach, describe, expect, it, vi } from "vitest";

const deliverNotificationTestMock = vi.fn();
const configureRuntimeMock = vi.fn();
const clearRuntimeMock = vi.fn();

vi.mock("@/pipeline/notifications/notification-delivery", () => ({
	deliverNotificationTest: (...args: unknown[]) => deliverNotificationTestMock(...args),
}));

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
});
