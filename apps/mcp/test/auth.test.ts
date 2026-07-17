import { afterEach, describe, expect, it, vi } from "vitest";

import { authenticatePhaseoUser } from "../src/phaseo-api";

const env = { PHASEO_API_BASE_URL: "https://api.phaseo.app" };

describe("MCP OAuth resource binding", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("accepts a delegated token bound to this MCP resource", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => Response.json({
			data: {
				current_workspace_id: "workspace_1",
				oauth: { resource: "https://mcp.phaseo.app/mcp" },
			},
		})));

		await expect(authenticatePhaseoUser(new Request("https://mcp.phaseo.app/mcp", {
			headers: { Authorization: "Bearer delegated-token" },
		}), env)).resolves.toEqual({
			accessToken: "delegated-token",
			workspaceId: "workspace_1",
		});
	});

	it("rejects a valid Phaseo token issued for another resource", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => Response.json({
			data: {
				current_workspace_id: "workspace_1",
				oauth: { resource: "https://another.example/mcp" },
			},
		})));

		await expect(authenticatePhaseoUser(new Request("https://mcp.phaseo.app/mcp", {
			headers: { Authorization: "Bearer delegated-token" },
		}), env)).resolves.toBeNull();
	});
});
