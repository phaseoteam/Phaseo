import { describe, expect, it } from "vitest";
import { normalizeMcpAction } from "./actionApprovals";

describe("MCP action approval normalization", () => {
	it("accepts a bounded privileged action", () => {
		expect(normalizeMcpAction({
			tool_name: "api_key_update",
			title: "Update API key",
			method: "PATCH",
			path: "/v1/keys/key_1",
			payload: { name: "Production" },
			required_scopes: ["keys:write"],
		})).toMatchObject({ tool_name: "api_key_update", method: "PATCH", required_scopes: ["keys:write"] });
	});

	it("rejects traversal paths and read-only scope substitutions", () => {
		expect(normalizeMcpAction({
			tool_name: "api_key_update", title: "Update", method: "PATCH",
			path: "/v1/keys/../workspaces", payload: {}, required_scopes: ["keys:write"],
		})).toBeNull();
		expect(normalizeMcpAction({
			tool_name: "api_key_update", title: "Update", method: "PATCH",
			path: "/v1/keys/key_1", payload: {}, required_scopes: ["keys:read"],
		})).toBeNull();
	});

	it("rejects oversized action payloads", () => {
		expect(normalizeMcpAction({
			tool_name: "settings_update", title: "Update settings", method: "PATCH",
			path: "/v1/settings", payload: { value: "x".repeat(13 * 1024) }, required_scopes: ["settings:write"],
		})).toBeNull();
	});
});
