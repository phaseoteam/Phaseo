import { describe, expect, it } from "vitest";
import { providerWorkspaceAccess } from "./settings-provider-onboarding";

describe("provider workspace access", () => {
	it("keeps personal workspaces separate from provider identity", () => {
		expect(providerWorkspaceAccess("personal", "owner")).toEqual({ eligible: false, canManage: true });
	});

	it("allows organisation owners and admins to manage provider capability", () => {
		expect(providerWorkspaceAccess("organization", "owner")).toEqual({ eligible: true, canManage: true });
		expect(providerWorkspaceAccess("enterprise", "admin")).toEqual({ eligible: true, canManage: true });
		expect(providerWorkspaceAccess("organization", "member")).toEqual({ eligible: true, canManage: false });
	});
});
