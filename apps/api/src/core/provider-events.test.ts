import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const updatePatches: Record<string, unknown>[] = [];

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		rpc: (...args: unknown[]) => rpcMock(...args),
		from: () => ({
			update: (patch: Record<string, unknown>) => {
				updatePatches.push(patch);
				return {
					eq: () => ({
						eq: async () => ({ error: null }),
					}),
				};
			},
		}),
	}),
}));

import { claimProviderEvent, listUnprocessedProviderEvents, markProviderEventProcessed } from "./provider-events";

describe("provider event replay claims", () => {
	beforeEach(() => {
		rpcMock.mockReset();
		updatePatches.length = 0;
	});

	it("claims due events atomically with a bounded lease", async () => {
		rpcMock.mockResolvedValueOnce({
			data: [{
				id: "event_row_1",
				provider: "openai",
				provider_event_id: "evt_1",
				kind: "batch.completed",
				workspace_id: null,
				internal_id: null,
				payload: {},
				processed_at: null,
				attempt_count: 0,
				next_attempt_at: null,
				created_at: "2026-07-18T00:00:00.000Z",
			}],
			error: null,
		});

		await expect(listUnprocessedProviderEvents({
			providers: ["openai", "openai", "google-ai-studio"],
			limit: 1_000,
			workerId: "worker-1",
			leaseSeconds: 5,
		})).resolves.toEqual([expect.objectContaining({ providerEventId: "evt_1" })]);
		expect(rpcMock).toHaveBeenCalledWith("gateway_claim_provider_events", {
			p_providers: ["openai", "google-ai-studio"],
			p_limit: 500,
			p_worker_id: "worker-1",
			p_lease_seconds: 30,
		});
	});

	it("claims one webhook delivery by provider event id", async () => {
		rpcMock.mockResolvedValueOnce({ data: true, error: null });

		await expect(claimProviderEvent({
			provider: "openai",
			providerEventId: "evt_1",
			workerId: "webhook-1",
			leaseSeconds: 5,
		})).resolves.toBe(true);
		expect(rpcMock).toHaveBeenCalledWith("gateway_claim_provider_event", {
			p_provider: "openai",
			p_provider_event_id: "evt_1",
			p_worker_id: "webhook-1",
			p_lease_seconds: 30,
		});
	});

	it("clears replay leases when processing completes", async () => {
		await markProviderEventProcessed({ provider: "openai", providerEventId: "evt_1" });
		expect(updatePatches).toEqual([expect.objectContaining({
			processed_at: expect.any(String),
			replay_locked_at: null,
			replay_locked_by: null,
		})]);
	});
});
