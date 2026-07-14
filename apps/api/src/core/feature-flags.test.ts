import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBatchApiFeatureGateName, isBatchApiAccessEnabled } from "./feature-flags";
import type { AuthSuccess } from "@pipeline/before/auth";

const auth: AuthSuccess = {
	ok: true,
	workspaceId: "ws_batch_admin",
	apiKeyId: "key_batch_admin",
	apiKeyRef: "kid_batch_admin",
	apiKeyKid: "batch_admin",
	userId: "user_admin",
	internal: false,
};

describe("batch API feature gate", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("uses the configured Statsig gate name", () => {
		expect(getBatchApiFeatureGateName({ STATSIG_BATCH_API_GATE: "custom_batch_gate" })).toBe("custom_batch_gate");
		expect(getBatchApiFeatureGateName({})).toBe("gateway_batch_api");
	});

	it("checks the Statsig gate with workspace and API key identifiers", async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			expect(body).toMatchObject({
				gateName: "gateway_batch_api",
				user: {
					userID: "user_admin",
					customIDs: {
						workspaceID: "ws_batch_admin",
						apiKeyID: "key_batch_admin",
						apiKeyKid: "batch_admin",
					},
					custom: {
						workspace_id: "ws_batch_admin",
						api_key_id: "key_batch_admin",
						api_key_ref: "kid_batch_admin",
						api_key_kid: "batch_admin",
						is_internal: false,
						surface: "gateway_batch_api",
					},
				},
			});
			return new Response(JSON.stringify({ name: "gateway_batch_api", value: true }), {
				headers: { "Content-Type": "application/json" },
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(isBatchApiAccessEnabled(auth, {
			STATSIG_SERVER_KEY: "secret-statsig-key",
			STATSIG_ENVIRONMENT_TIER: "staging",
		})).resolves.toBe(true);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.statsig.com/v1/check_gate",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					"statsig-api-key": "secret-statsig-key",
				}),
			}),
		);
	});

	it("fails closed when Statsig rejects the gate check", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));

		await expect(isBatchApiAccessEnabled(auth, {
			STATSIG_SERVER_KEY: "secret-statsig-key",
		})).resolves.toBe(false);
	});
});

