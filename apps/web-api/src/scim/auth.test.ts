import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDataClient } from "@/data/supabase";
import { authenticateScim, hashScimToken } from "./auth";

vi.mock("@/data/supabase", () => ({ getDataClient: vi.fn() }));

const token = `ph_scim_12345678_${"a".repeat(64)}`;
const env = { SCIM_TOKEN_PEPPER: "p".repeat(32) } as never;

function clientFor(subscription: { data: { status: string; grace_until: string | null } | null; error: unknown }) {
	const tokenResult = {
		data: { id: "token-1", token_hash: "", expires_at: null, revoked_at: null, created_by: "owner-1", endpoint: { id: "endpoint-1", workspace_id: "workspace-1", enabled: true } },
		error: null,
	};
	const usageUpdate = vi.fn(async () => ({ error: null }));
	const client = {
		from(table: string) {
			if (table === "scim_tokens") return {
				select: () => { const query = { eq: () => query, maybeSingle: async () => tokenResult }; return query; },
				update: () => ({ eq: usageUpdate }),
			};
			if (table === "workspaces") return {
				select: () => { const query = { eq: () => query, maybeSingle: async () => ({ data: { owner_user_id: "owner-1" }, error: null }) }; return query; },
			};
			if (table === "workspace_addon_subscriptions") return {
				select: () => { const query = { eq: () => query, maybeSingle: async () => subscription }; return query; },
			};
			throw new Error(`Unexpected table ${table}`);
		},
	};
	return { client, tokenResult, usageUpdate };
}

describe("SCIM authentication entitlement enforcement", () => {
	beforeEach(() => vi.clearAllMocks());

	it("accepts a valid token while the Identity subscription is active", async () => {
		const fixture = clientFor({ data: { status: "active", grace_until: null }, error: null });
		fixture.tokenResult.data.token_hash = await hashScimToken(env, token);
		vi.mocked(getDataClient).mockReturnValue(fixture.client as never);
		await expect(authenticateScim(new Request("https://phaseo.app/scim/v2/Users", { headers: { authorization: `Bearer ${token}` } }), env)).resolves.toEqual({ workspaceId: "workspace-1", endpointId: "endpoint-1", tokenId: "token-1" });
		expect(fixture.usageUpdate).toHaveBeenCalledOnce();
	});

	it("rejects an otherwise valid token after the subscription is cancelled", async () => {
		const fixture = clientFor({ data: { status: "canceled", grace_until: null }, error: null });
		fixture.tokenResult.data.token_hash = await hashScimToken(env, token);
		vi.mocked(getDataClient).mockReturnValue(fixture.client as never);
		await expect(authenticateScim(new Request("https://phaseo.app/scim/v2/Users", { headers: { authorization: `Bearer ${token}` } }), env)).resolves.toBeNull();
		expect(fixture.usageUpdate).not.toHaveBeenCalled();
	});

	it("fails closed when subscription state cannot be read", async () => {
		const fixture = clientFor({ data: null, error: { code: "database_unavailable" } });
		fixture.tokenResult.data.token_hash = await hashScimToken(env, token);
		vi.mocked(getDataClient).mockReturnValue(fixture.client as never);
		await expect(authenticateScim(new Request("https://phaseo.app/scim/v2/Users", { headers: { authorization: `Bearer ${token}` } }), env)).resolves.toBeNull();
		expect(fixture.usageUpdate).not.toHaveBeenCalled();
	});
});
