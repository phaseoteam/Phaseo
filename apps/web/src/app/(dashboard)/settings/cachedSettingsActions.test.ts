import { WebApiError } from "@/lib/web-api/client";

const readers: Record<string, jest.Mock> = {};
const readerNames = [
	"fetchSettingsAppsInitialData", "fetchSettingsAuthorizedAppsInitialData", "fetchSettingsDynamicRoutesInitialData",
	"fetchSettingsKeysInitialData", "fetchSettingsManagementApiKeysInitialData", "fetchSettingsRoutingInitialData",
	"fetchSettingsGuardrailsInitialData", "fetchSettingsPrivacyInitialData", "fetchSettingsByokInitialData",
	"fetchSettingsPresetsInitialData", "fetchSettingsPrivateModels", "fetchSettingsTeamsInitialData",
	"fetchSettingsUsageAlertsInitialData", "fetchSettingsCreditsTransactionsInitialData", "fetchSettingsAccountDetailsInitialData",
	"fetchSettingsProfileInitialData", "fetchSettingsProfileUsageSummary", "fetchSettingsProfileGames",
	"fetchSettingsCreditsInitialData", "fetchSettingsPresetFeedback",
	"fetchSettingsOAuthAppsInitialData", "fetchSettingsOAuthAppDetailInitialData",
	"fetchSettingsBetaInitialData", "fetchSettingsObservabilityDestinationNewInitialData",
];
for (const name of readerNames) {
	readers[name] = jest.fn();
	jest.doMock(`@/lib/fetchers/internal/${name}`, () => ({ [name]: readers[name] }));
}
const context = jest.fn();
jest.doMock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: context }));
jest.doMock("@/lib/games/preview", () => ({ catalogueGamesEnabled: async () => false }));
// Load after the read-only boundaries are mocked; never call live services in tests.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readCachedSettings } = require("./cachedSettingsActions") as typeof import("./cachedSettingsActions");
const scope = { userId: "alice", workspaceId: "workspace-a" };

beforeEach(() => {
	jest.clearAllMocks();
	context.mockResolvedValue({ ...scope, accessToken: "test-token" });
	for (const reader of Object.values(readers)) reader.mockResolvedValue({ signedIn: true });
});

it.each([
	{ ...scope, userId: "bob" },
	{ ...scope, userId: null },
])("does not load data for a mismatched identity %j", async (requested) => {
	expect(await readCachedSettings("apps", requested)).toEqual({ denied: 401 });
	expect(readers.fetchSettingsAppsInitialData).not.toHaveBeenCalled();
});
it("rejects an expired session before calling a reader", async () => {
	context.mockResolvedValue({ ...scope, accessToken: null });
	expect(await readCachedSettings("apps", scope)).toEqual({ denied: 401 });
});
it("does not load a different workspace under the previous workspace's key", async () => {
	expect(await readCachedSettings("apps", { ...scope, workspaceId: "workspace-b" })).toEqual({ denied: 403 });
	expect(readers.fetchSettingsAppsInitialData).not.toHaveBeenCalled();
});
it("allows account-only settings without a workspace", async () => {
	expect(await readCachedSettings("account-details", { ...scope, workspaceId: null })).toEqual({ data: { signedIn: true } });
});
it.each(["__proto__", "constructor", "reveal-key", "checkout", "mfa"])("rejects non-allowlisted reads: %s", async (resource) => {
	await expect(readCachedSettings(resource as never, scope)).rejects.toThrow("Unknown settings resource");
	expect(context).not.toHaveBeenCalled();
});
it.each([401, 403])("preserves HTTP %s denials across the server-action boundary", async (status) => {
	readers.fetchSettingsAppsInitialData.mockRejectedValue(new WebApiError("/apps", status));
	expect(await readCachedSettings("apps", scope)).toEqual({ denied: status });
});
it("retains authorized preferred-workspace selection", async () => {
	await readCachedSettings("keys", scope, "workspace-b");
	expect(readers.fetchSettingsKeysInitialData).toHaveBeenCalledWith("workspace-b");
	await readCachedSettings("teams", scope, "workspace-b");
	expect(readers.fetchSettingsTeamsInitialData).toHaveBeenCalledWith("workspace-b");
});
it("passes feedback filters only to the feedback reader", async () => {
	await readCachedSettings("preset-feedback", scope, undefined, "filters");
	expect(readers.fetchSettingsPresetFeedback).toHaveBeenCalledWith("filters");
});
it.each([
	["oauth-app", "client-1", "fetchSettingsOAuthAppDetailInitialData"],
	["broadcast-form", "webhook", "fetchSettingsObservabilityDestinationNewInitialData"],
] as const)("passes the selected %s identifier to its authorized reader", async (resource, id, reader) => {
	await readCachedSettings(resource, scope, undefined, id);
	expect(readers[reader]).toHaveBeenCalledWith(id);
	jest.clearAllMocks();
	expect(await readCachedSettings(resource, { ...scope, workspaceId: "other" }, undefined, id)).toEqual({ denied: 403 });
	expect(readers[reader]).not.toHaveBeenCalled();
	await expect(readCachedSettings(resource, scope)).rejects.toThrow("Missing");
});
it("reads OAuth lists and account-only beta preferences through the allowlist", async () => {
	await readCachedSettings("oauth-apps", scope);
	expect(readers.fetchSettingsOAuthAppsInitialData).toHaveBeenCalledTimes(1);
	await readCachedSettings("beta", { ...scope, workspaceId: null });
	expect(readers.fetchSettingsBetaInitialData).toHaveBeenCalledTimes(1);
});
it("does not serialize payment or MFA fields with notification preferences", async () => {
	readers.fetchSettingsCreditsInitialData.mockResolvedValue({ lowBalanceEmailEnabled: true, wallet: { secret: "private" }, stripeInfo: { secret: "private" }, mfaEnabled: true });
	const response = await readCachedSettings("notifications", scope);
	expect(response).toMatchObject({ data: { lowBalanceEmailEnabled: true } });
	if (!("data" in response)) throw new Error("Expected preferences");
	expect(response.data).not.toHaveProperty("wallet");
	expect(response.data).not.toHaveProperty("stripeInfo");
	expect(response.data).not.toHaveProperty("mfaEnabled");
});
