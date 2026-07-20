import { afterEach, describe, expect, it, vi } from "vitest";

import { authenticatePhaseoUser } from "../src/phaseo-api";

const env = {
	PHASEO_API_BASE_URL: "https://api.phaseo.app",
	PHASEO_MCP_RESOURCE_SERVER_SECRET: "s".repeat(64),
};

describe("MCP OAuth resource binding", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("exchanges a delegated MCP token for a separate upstream token", async () => {
		const fetchMock = vi.fn(async (_request: Request) => Response.json({
			active: true,
			resource: "https://mcp.phaseo.app/mcp",
			workspace_id: "workspace_1",
			scope: "openid models:read",
			upstream_access_token: "upstream-token",
		}));
		vi.stubGlobal("fetch", fetchMock);

		await expect(authenticatePhaseoUser(new Request("https://mcp.phaseo.app/mcp", {
			headers: { Authorization: "Bearer delegated-token" },
		}), env)).resolves.toEqual({
			accessToken: "upstream-token",
			workspaceId: "workspace_1",
			scopes: ["openid", "models:read"],
		});
		const exchangeRequest = fetchMock.mock.calls[0]?.[0] as Request;
		expect(exchangeRequest.url).toBe("https://api.phaseo.app/oauth/mcp/token-exchange");
		expect(await exchangeRequest.clone().text()).toContain("subject_token=delegated-token");
	});

	it("rejects a token exchange issued for another resource", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => Response.json({
			active: true,
			resource: "https://another.example/mcp",
			workspace_id: "workspace_1",
			upstream_access_token: "upstream-token",
		})));

		await expect(authenticatePhaseoUser(new Request("https://mcp.phaseo.app/mcp", {
			headers: { Authorization: "Bearer delegated-token" },
		}), env)).resolves.toBeNull();
	});
});
