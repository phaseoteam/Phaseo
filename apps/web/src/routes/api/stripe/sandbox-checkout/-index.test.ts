// The sandbox test checkout is for Phaseo admins only: everyone else gets a 404 and no session.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { admin: false, created: 0 };

vi.mock("@/lib/auth/getViewerRole", () => ({ isAdminViewer: async () => state.admin }));
vi.mock("@/lib/server/stripeSandboxCheckout", () => ({
	isStripeSandboxConfigured: () => true,
	createStripeSandboxCheckout: async () => {
		state.created += 1;
		return { url: "https://checkout.stripe.com/c/pay/cs_test_1", workspaceId: "909aa1dc-8286-4215-966c-ff68666cc0f0" };
	},
}));

import { serverRouteHandler } from "@/lib/testing/serverRoute";
import { Route } from "./index";

const GET = serverRouteHandler(Route, "GET");
const POST = serverRouteHandler(Route, "POST");
const post = () => POST(new Request("https://phaseo.app/api/stripe/sandbox-checkout", { method: "POST", headers: { origin: "https://phaseo.app", "sec-fetch-site": "same-origin" } }));
const get = () => GET(new Request("https://phaseo.app/api/stripe/sandbox-checkout"));

beforeEach(() => {
	state.admin = false;
	state.created = 0;
	process.env.PUBLIC_WEBSITE_URL = "https://phaseo.app";
});

describe("/api/stripe/sandbox-checkout", () => {
	it("hides itself from non-admins and never creates a session for them", async () => {
		expect((await get()).status).toBe(404);
		expect((await post()).status).toBe(404);
		expect(state.created).toBe(0);
	});

	it("lets admins see the status and open a sandbox checkout", async () => {
		state.admin = true;
		expect(await (await get()).json()).toEqual({ configured: true });
		const response = await post();
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });
		expect(state.created).toBe(1);
	});
});
