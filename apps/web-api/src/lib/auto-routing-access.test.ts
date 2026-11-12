import { afterEach, describe, expect, it, vi } from "vitest";
import { autoRoutingAvailable, isAutoRoutingModel } from "./auto-routing-access";

const subject = { workspaceId: "00000000-0000-4000-8000-000000000001", userId: "user-a" };

afterEach(() => vi.unstubAllGlobals());

describe("Auto Routing access", () => {
	it("is a no without a Statsig key, except in local development", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await expect(autoRoutingAvailable({ ENV: "production" } as never, subject)).resolves.toBe(false);
		await expect(autoRoutingAvailable({ ENV: "staging" } as never, subject)).resolves.toBe(false);
		await expect(autoRoutingAvailable({ ENV: "development" } as never, subject)).resolves.toBe(true);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("reads Statsig's answer in either shape, and a failed check is a no", async () => {
		const env = { ENV: "staging", STATSIG_SERVER_KEY: "statsig-server-key" } as never;
		vi.stubGlobal("fetch", vi.fn(async () => Response.json({ results: { gateway_auto_routing: { value: true } } })));
		await expect(autoRoutingAvailable(env, subject)).resolves.toBe(true);
		const fetchMock = vi.mocked(fetch);
		expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).user.statsigEnvironment).toEqual({ tier: "staging" });
		vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
		const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
		await expect(autoRoutingAvailable(env, subject)).resolves.toBe(false);
		logged.mockRestore();
	});

	it("recognises Auto as the gateway does", () => {
		expect(isAutoRoutingModel(" PHASEO/AUTO ")).toBe(true);
		expect(isAutoRoutingModel("phaseo/auto-preview")).toBe(false);
		expect(isAutoRoutingModel(null)).toBe(false);
	});
});
