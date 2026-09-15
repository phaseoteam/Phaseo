import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { parseLowBalanceThresholdNanos } from "./credits";

afterEach(() => vi.unstubAllGlobals());

describe("account credit routes", () => {
	function autoTopUpRequest(factors: unknown[], currentAutoTopUpEnabled = false) {
		const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes("/auth/v1/user")) {
				return Response.json({ id: "user-1", factors });
			}
			if (url.includes("workspace_members")) {
				return Response.json(url.includes("select=workspace_id") ? [{ workspace_id: "workspace-1" }] : [{ role: "admin" }]);
			}
			if (url.includes("/rpc/update_workspace_auto_top_up")) {
				const args = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
				rpcCalls.push({ name: "update_workspace_auto_top_up", args });
				const mfaEnabled = Array.isArray(factors) && factors.some((factor) =>
					factor && typeof factor === "object" &&
						(factor as Record<string, unknown>).factor_type === "totp" &&
						(factor as Record<string, unknown>).status === "verified",
				);
				const bypassAcknowledged = args.p_mfa_bypass_acknowledged === true && args.p_mfa_bypass_phrase === "I ACCEPT THE RISK";
				if (args.p_enabled === true && !mfaEnabled && !currentAutoTopUpEnabled && !bypassAcknowledged) {
					return Response.json({ code: "P0001", message: "mfa_required" }, { status: 400 });
				}
				return Response.json([{ workspace_id: "workspace-1", auto_top_up_enabled: args.p_enabled }]);
			}
			if (url.includes("wallets")) {
				return Response.json([]);
			}
			return Response.json([]);
		}));
		return { rpcCalls };
	}

	it("rejects enabling Auto Top-Up without a verified TOTP factor", async () => {
		const { rpcCalls } = autoTopUpRequest([]);
		const response = await app.request("https://phaseo.app/api/account/credits/auto-top-up", {
			method: "PUT",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", enabled: true, topUpAmount: 2_000_000_000 }),
		}, { ENV: "development", SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" });

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: "mfa_required" });
		expect(rpcCalls).toHaveLength(1);
		expect(rpcCalls[0].args).toMatchObject({ p_enabled: true, p_mfa_enabled: false });
	});

	it("allows enabling Auto Top-Up with a verified TOTP factor", async () => {
		const { rpcCalls } = autoTopUpRequest([{ factor_type: "totp", status: "verified" }]);
		const response = await app.request("https://phaseo.app/api/account/credits/auto-top-up", {
			method: "PUT",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", enabled: true, topUpAmount: 2_000_000_000 }),
		}, { ENV: "development", SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" });

		expect(response.status).toBe(200);
		expect(rpcCalls).toHaveLength(1);
		expect(rpcCalls[0].args).toMatchObject({ p_enabled: true, p_mfa_enabled: true });
	});

	it("allows the explicit no-MFA bypass only with the confirmation phrase", async () => {
		const { rpcCalls } = autoTopUpRequest([]);
		const response = await app.request("https://phaseo.app/api/account/credits/auto-top-up", {
			method: "PUT",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({
				workspaceId: "workspace-1",
				enabled: true,
				topUpAmount: 2_000_000_000,
				mfaBypassAcknowledged: true,
				mfaBypassPhrase: "I ACCEPT THE RISK",
			}),
		}, { ENV: "development", SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" });

		expect(response.status).toBe(200);
		expect(rpcCalls).toHaveLength(1);
		expect(rpcCalls[0].args).toMatchObject({ p_mfa_bypass_acknowledged: true, p_mfa_bypass_phrase: "I ACCEPT THE RISK" });
	});

	it("allows updating an existing no-MFA Auto Top-Up configuration without re-acknowledging the bypass", async () => {
		const { rpcCalls } = autoTopUpRequest([], true);
		const response = await app.request("https://phaseo.app/api/account/credits/auto-top-up", {
			method: "PUT",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", enabled: true, topUpAmount: 3_000_000_000 }),
		}, { ENV: "development", SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" });

		expect(response.status).toBe(200);
		expect(rpcCalls).toHaveLength(1);
		expect(rpcCalls[0].args).toMatchObject({ p_enabled: true, p_mfa_enabled: false, p_mfa_bypass_acknowledged: false });
	});

	it("rejects the no-MFA bypass with an incorrect confirmation phrase", async () => {
		const { rpcCalls } = autoTopUpRequest([]);
		const response = await app.request("https://phaseo.app/api/account/credits/auto-top-up", {
			method: "PUT",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({
				workspaceId: "workspace-1",
				enabled: true,
				topUpAmount: 2_000_000_000,
				mfaBypassAcknowledged: true,
				mfaBypassPhrase: "I ACCEPT THE CHARGE",
			}),
		}, { ENV: "development", SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" });

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: "mfa_required" });
		expect(rpcCalls).toHaveLength(1);
		expect(rpcCalls[0].args).toMatchObject({ p_mfa_bypass_acknowledged: true, p_mfa_bypass_phrase: "I ACCEPT THE CHARGE" });
	});

	it("rejects unsupported notification sample kinds before calling the gateway", async () => {
		const calls: string[] = [];
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			calls.push(url);
			if (url.includes("/auth/v1/user")) return Response.json({ id: "user-1" });
			if (url.includes("workspace_members")) return Response.json([{ role: "admin" }]);
			if (url.includes("/workspaces")) return Response.json([{ owner_user_id: "user-1" }]);
			return Response.json([]);
		}));
		const response = await app.request("https://phaseo.app/api/account/credits/notification-destinations/test", {
			method: "POST",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", type: "email", target: "owner@example.com", kind: "other" }),
		}, { ENV: "development", SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" });
		expect(response.status).toBe(400);
		expect(calls.some((url) => url.includes("/internal/notification-tests"))).toBe(false);
	});
	it("accepts non-negative low-balance thresholds with up to two decimal places", () => {
		expect(parseLowBalanceThresholdNanos(0)).toBe(0);
		expect(parseLowBalanceThresholdNanos(12)).toBe(12_000_000_000);
		expect(parseLowBalanceThresholdNanos(12.3)).toBe(12_300_000_000);
		expect(parseLowBalanceThresholdNanos(12.34)).toBe(12_340_000_000);
		expect(parseLowBalanceThresholdNanos(0.01)).toBe(10_000_000);
	});

	it("rejects invalid or over-precise low-balance thresholds", () => {
		expect(parseLowBalanceThresholdNanos(-1)).toBeNull();
		expect(parseLowBalanceThresholdNanos(12.345)).toBeNull();
		expect(parseLowBalanceThresholdNanos("not-a-number")).toBeNull();
	});

	it("rejects unauthenticated balance reads and marks them private", async () => {
		const response = await app.request("https://phaseo.app/api/account/credits/balance?workspaceId=workspace-1", {}, { ENV: "development" });
		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(response.headers.get("vary")).toBe("Authorization, Cookie");
	});

	it("returns an empty private redeem bootstrap for signed-out users", async () => {
		const response = await app.request("https://phaseo.app/api/account/credits/redeem-initial", {}, { ENV: "development" });
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
		await expect(response.json()).resolves.toEqual({
			activeWorkspaceId: null,
			invoiceTeamIds: [],
			signedIn: false,
			teamOptions: [],
		});
	});

	it("uses the active workspace cookie only after bearer and membership verification", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/auth/v1/user")) {
				return new Response(JSON.stringify({
					id: "user-1",
					email: "user@example.com",
				}), { status: 200 });
			}
			if (url.includes("workspace_members")) {
				return new Response(JSON.stringify([{ workspace_id: "workspace-1" }]), { status: 200 });
			}
			if (url.includes("wallets")) {
				return new Response(JSON.stringify([{ balance_nanos: 12_500_000_000 }]), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/account/credits/balance",
			{
				headers: {
					authorization: "Bearer session-token",
					cookie: "activeWorkspaceId=workspace-1",
				},
			},
			{
				ENV: "development",
				SUPABASE_URL: "https://example.supabase.co",
				SUPABASE_ANON_KEY: "anon-key",
				SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
			},
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
		await expect(response.json()).resolves.toEqual({ initialBalance: 12.5 });
	});
});
