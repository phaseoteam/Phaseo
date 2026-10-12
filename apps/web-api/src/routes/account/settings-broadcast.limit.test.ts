import { describe, expect, it, vi } from "vitest";

const inserted = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("./context", () => ({
	requireAccountWorkspace: async () => ({
		workspaceId: "workspace_1",
		role: "owner",
		client: {
			from: () => ({
				insert: (row: Record<string, unknown>) => {
					inserted.push(row);
					return {
						select: () => ({
							single: async () => ({ data: null, error: { code: "23514", message: "broadcast_destination_limit_reached" } }),
						}),
					};
				},
			}),
		},
	}),
}));

vi.mock("./broadcast-config-crypto", () => ({
	encryptBroadcastConfig: async () => ({ ciphertext: "encrypted", iv: "iv", keyVersion: "v1" }),
	decryptBroadcastConfig: async () => ({}),
}));

describe("broadcast destination creation", () => {
	it("explains the per-type destination cap", async () => {
		const { accountSettingsBroadcastRouter } = await import("./settings-broadcast");
		const response = await accountSettingsBroadcastRouter.request("https://example.com/broadcast", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				workspaceId: "workspace_1",
				destinationId: "otel_collector",
				name: "Collector",
				config: { collector_endpoint: "https://collector.example.com" },
			}),
		}, {});
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "Destination limit reached for this type", code: "destination_limit_reached" });
		expect(inserted[0]).toMatchObject({ destination_id: "otel_collector", destination_config: {} });
	});
});
