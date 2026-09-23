jest.mock("next/cache", () => ({ revalidatePath: jest.fn(), updateTag: jest.fn() }));
jest.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: jest.fn() }));
jest.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: jest.fn() }));

import { revalidatePath } from "next/cache";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { createByokKeyAction, updateByokKeyAction, deleteByokKeyAction, updateByokFallbackAction, reorderByokKeyAction } from "./byok/actions";
import { createGuardrail, updateGuardrail, deleteGuardrail, updateGlobalGuardrailsSettings, setGuardrailKeys, setGuardrailMembers } from "./guardrails/actions";
import { createPrivateModelAction, updatePrivateModelAction, deletePrivateModelAction } from "./workspaces/private-models/actions";

const mutations: Array<[string, () => Promise<unknown>]> = [
	["create BYOK", () => createByokKeyAction("Test", "openai", "sk-fixture-not-a-real-provider-key")],
	["update BYOK", () => updateByokKeyAction("key", { enabled: false })],
	["delete BYOK", () => deleteByokKeyAction("key")],
	["BYOK fallback", () => updateByokFallbackAction(false)],
	["reorder BYOK", () => reorderByokKeyAction("key", "up")],
	["create guardrail", () => createGuardrail({ name: "Test" })],
	["update guardrail", () => updateGuardrail("guardrail", { name: "Test" })],
	["delete guardrail", () => deleteGuardrail("guardrail")],
	["global policy", () => updateGlobalGuardrailsSettings({ privacyZdrOnly: true })],
	["guardrail keys", () => setGuardrailKeys("guardrail", [])],
	["guardrail members", () => setGuardrailMembers("guardrail", [])],
	["create private model", () => createPrivateModelAction({ name: "Test" })],
	["update private model", () => updatePrivateModelAction("model", { name: "Test" })],
	["delete private model", () => deletePrivateModelAction("model")],
];

beforeEach(() => {
	jest.clearAllMocks();
	jest.mocked(getServerAccountContext).mockResolvedValue({ accessToken: "fixture-token", workspaceId: "workspace-a" } as never);
});

it.each(mutations)("%s preserves publication failure without replaying a committed write", async (_name, mutate) => {
	const result = { id: "created", success: true, gatewayCacheInvalidated: false };
	jest.mocked(fetchAccountWebApi).mockResolvedValue(result);
	await expect(mutate()).resolves.toBe(result);
	expect(fetchAccountWebApi).toHaveBeenCalledTimes(1);
	expect(revalidatePath).toHaveBeenCalled();
});

it.each(mutations)("%s preserves database failures", async (_name, mutate) => {
	jest.mocked(fetchAccountWebApi).mockRejectedValue(new Error("write rejected"));
	await expect(mutate()).rejects.toThrow("write rejected");
	expect(fetchAccountWebApi).toHaveBeenCalledTimes(1);
	expect(revalidatePath).not.toHaveBeenCalled();
});

it.each(mutations)("%s rejects unauthenticated mutations", async (_name, mutate) => {
	jest.mocked(getServerAccountContext).mockResolvedValue({ accessToken: null, workspaceId: "workspace-a" } as never);
	await expect(mutate()).rejects.toThrow("Unauthorized");
	expect(fetchAccountWebApi).not.toHaveBeenCalled();
});
