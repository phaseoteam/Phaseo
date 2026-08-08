import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { parseLowBalanceThresholdNanos } from "./credits";

afterEach(() => vi.unstubAllGlobals());

describe("account credit routes", () => {
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
