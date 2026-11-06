import { afterEach, describe, expect, it, vi } from "vitest";
import { redirect } from "@tanstack/react-router";
import { serverAuthRedirectAction } from "./actionMiddleware";

type ClientMiddleware = (ctx: { next: () => Promise<unknown> }) => Promise<unknown>;
const runClient = (serverAuthRedirectAction as unknown as { options: { client: ClientMiddleware } }).options.client;

describe("serverAuthRedirectAction", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete (globalThis as { __phaseoRouter?: unknown }).__phaseoRouter;
	});

	it("loads the redirect target as a full page, not a client-side navigation", async () => {
		const assign = vi.fn();
		const navigate = vi.fn();
		vi.stubGlobal("window", { location: { assign } });
		(globalThis as { __phaseoRouter?: unknown }).__phaseoRouter = { navigate, resolveRedirect: (r: unknown) => r };

		const pending = runClient({
			next: async () => {
				throw redirect({ href: "/settings/keys?tab=active", statusCode: 307 });
			},
		});
		// The call never settles: the page is unloading.
		const settled = await Promise.race([pending.then(() => "settled"), new Promise((r) => setTimeout(() => r("pending"), 20))]);

		expect(settled).toBe("pending");
		expect(assign).toHaveBeenCalledWith("/settings/keys?tab=active");
		expect(navigate).not.toHaveBeenCalled();
	});

	it("passes other errors through", async () => {
		await expect(runClient({ next: async () => { throw new Error("nope"); } })).rejects.toThrow("nope");
	});
});
