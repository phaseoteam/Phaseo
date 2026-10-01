import { fetchSettingsOAuthAppsInitialData } from "./fetchSettingsOAuthAppsInitialData";
import { fetchSettingsOAuthAppDetailInitialData } from "./fetchSettingsOAuthAppDetailInitialData";
import { fetchAccountWebApi } from "@/lib/web-api/client";

jest.mock("./serverAccountContext", () => ({ getServerAccountContext: async () => ({ accessToken: "test-token", workspaceId: "workspace-a" }) }));
jest.mock("@/lib/web-api/client", () => ({ fetchAccountWebApi: jest.fn() }));
const fetchData = jest.mocked(fetchAccountWebApi);
const app = { id: "app-a", client_id: "client-a", name: "Example", workspace_id: "workspace-a", redirect_uris: ["https://example.test/callback"], allowed_scopes: ["models:read"], active_authorizations: 2, client_secret: "secret", client_secret_hash: "hash", future_credential: "unknown" };

beforeEach(() => jest.clearAllMocks());

it("caches only OAuth app display fields, never credentials or unknown columns", async () => {
	fetchData.mockResolvedValue({ signedIn: true, initialTeamId: "workspace-a", oauthApps: [app], access_token: "secret" });
	const data = await fetchSettingsOAuthAppsInitialData();
	expect(data).toEqual({ signedIn: true, initialTeamId: "workspace-a", oauthApps: [{ id: "app-a", client_id: "client-a", name: "Example", workspace_id: "workspace-a", redirect_uris: app.redirect_uris, allowed_scopes: app.allowed_scopes, active_authorizations: 2 }] });
	expect(fetchData).toHaveBeenCalledWith("/api/account/settings/oauth-apps?workspaceId=workspace-a", "test-token");
});

it("excludes authorization tokens and nested private fields from cached details", async () => {
	fetchData.mockResolvedValue({ signedIn: true, currentUserId: "alice", oauthApp: app, authorizations: [{ id: "auth-a", last_used_at: null, access_token: "secret", refresh_token: "secret", users: { full_name: "Alice", email: "alice@example.test", private: "secret" }, teams: { name: "Team", secret: "secret" } }], recentRequests: [], usageStats: [], userDirectory: [] });
	const data = await fetchSettingsOAuthAppDetailInitialData("client/a");
	expect(data.authorizations).toEqual([{ id: "auth-a", last_used_at: null, users: { full_name: "Alice", email: "alice@example.test" }, teams: { name: "Team" } }]);
	expect(JSON.stringify(data)).not.toMatch(/secret|hash|unknown/);
	expect(fetchData).toHaveBeenCalledWith("/api/account/settings/oauth-apps/client%2Fa", "test-token");
});

it("preserves missing-app responses so deleted apps are not displayed", async () => {
	fetchData.mockResolvedValue({ signedIn: true, currentUserId: "alice", oauthApp: null, authorizations: [], recentRequests: [], usageStats: [], userDirectory: [] });
	expect((await fetchSettingsOAuthAppDetailInitialData("deleted")).oauthApp).toBeNull();
});
