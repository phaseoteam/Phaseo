import { describe, expect, it } from "vitest";
import { PHASEO_MCP_RESOURCE, violatesMcpManagementBinding } from "./mcpScopes";

describe("violatesMcpManagementBinding", () => {
	it("allows dynamic management changes only on tokens bound to the Phaseo MCP with MCP-only scopes", () => {
		expect(violatesMcpManagementBinding("dynamic", PHASEO_MCP_RESOURCE, ["models:read", "gateway:access", "keys:write", "budgets:delete"])).toBe(false);
		expect(violatesMcpManagementBinding("dynamic", PHASEO_MCP_RESOURCE, ["keys:write", "workspaces:write"])).toBe(true);
		expect(violatesMcpManagementBinding("dynamic", "https://other.example/mcp", ["keys:write"])).toBe(true);
		expect(violatesMcpManagementBinding("dynamic", "", ["settings:write"])).toBe(true);
	});

	it("rejects a refresh, which carries no resource, holding a dynamic management change scope", () => {
		expect(violatesMcpManagementBinding("dynamic", null, ["openid", "keys:delete"])).toBe(true);
		expect(violatesMcpManagementBinding("dynamic", null, ["openid", "keys:read"])).toBe(false);
	});

	it("leaves read-only dynamic grants and other client kinds unchanged", () => {
		expect(violatesMcpManagementBinding("dynamic", null, ["models:read", "keys:read"])).toBe(false);
		expect(violatesMcpManagementBinding("first_party", null, ["keys:write"])).toBe(false);
		expect(violatesMcpManagementBinding("developer", "", ["keys:write"])).toBe(false);
	});
});
