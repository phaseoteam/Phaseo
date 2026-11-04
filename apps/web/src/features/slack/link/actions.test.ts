import { describe, it, expect, beforeEach, vi, type MockedFunction } from "vitest";
vi.mock("@/i18n/server", () => ({
	getTranslations: vi.fn(async () => (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key)),
}));
vi.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: vi.fn() }));

import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { confirmSlackLink, describeSlackLink } from "./actions";

const mockContext = getServerAccountContext as MockedFunction<typeof getServerAccountContext>;
const fetchMock = vi.fn();
const TOKEN = "eyJpbnN0YWxsYXRpb25faWQiOiJ4In0.c2lnbmF0dXJl";

function respond(status: number, body: unknown) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
	vi.clearAllMocks();
	global.fetch = fetchMock as unknown as typeof fetch;
	mockContext.mockResolvedValue({ accessToken: "token-a", userId: "user-a", workspaceId: null, obfuscateInfo: null });
});

describe("Confirming a Slack account link", () => {
	it("posts only the token, as the signed-in user, and names the team and workspace", async () => {
		fetchMock.mockResolvedValue(respond(200, { linked: true, workspaceId: "w", workspace_name: "Acme Inc", team_name: "Acme" }));
		expect(await confirmSlackLink({ data: { token: TOKEN, localeValue: "en-GB" } })).toEqual({ ok: true, title: "linkedTitle", message: 'linked {"team":"Acme","workspace":"Acme Inc"}' });
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toMatch(/\/api\/account\/settings\/slack\/link$/);
		expect(init.headers.Authorization).toBe("Bearer token-a");
		expect(JSON.parse(init.body)).toEqual({ token: TOKEN });
	});

	it("says why a link failed", async () => {
		for (const [error, key] of [["link_expired", "errors.expired"], ["link_used", "errors.used"], ["link_invalid", "errors.invalid"], ["forbidden", "errors.wrongWorkspace"], ["not_installed", "errors.notInstalled"], ["settings_write_failed", "errors.failed"]]) {
			fetchMock.mockResolvedValueOnce(respond(error === "settings_write_failed" ? 503 : 400, { error, message: "English text" }));
			expect(await confirmSlackLink({ data: { token: TOKEN, localeValue: "de-DE" } })).toEqual({ ok: false, title: "failedTitle", message: key });
		}
	});

	it("never calls the API without a well-formed token or a session", async () => {
		expect(await confirmSlackLink({ data: { token: "not a token", localeValue: "en-GB" } })).toMatchObject({ ok: false, message: "errors.invalid" });
		mockContext.mockResolvedValue({ accessToken: null, userId: null, workspaceId: null, obfuscateInfo: null });
		expect(await confirmSlackLink({ data: { token: TOKEN, localeValue: "en-GB" } })).toMatchObject({ ok: false, message: "errors.signIn" });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("Showing whose Slack account a link is for", () => {
	it("names the Slack account and team from the preview, without linking anything", async () => {
		fetchMock.mockResolvedValue(respond(200, { slack_user: { id: "U0PERSON01", handle: "mallory", real_name: "Mallory M", display_name: "mal" }, team_name: "Acme", workspace_name: "Acme Inc" }));
		expect(await describeSlackLink(TOKEN, "en-GB")).toEqual({ account: 'account {"name":"mal","id":"U0PERSON01","team":"Acme"}', failure: null });
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url).endsWith("/api/account/settings/slack/link/preview")).toBe(true);
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body)).toEqual({ token: TOKEN });
	});

	it("falls back to the handle, then to the Slack user id", async () => {
		fetchMock.mockResolvedValueOnce(respond(200, { slack_user: { id: "U0PERSON01", handle: "mallory", real_name: null, display_name: null }, team_name: null, workspace_name: "Acme Inc" }));
		expect((await describeSlackLink(TOKEN, "en-GB")).account).toBe('account {"name":"@mallory","id":"U0PERSON01","team":"Slack"}');
		fetchMock.mockResolvedValueOnce(respond(200, { slack_user: { id: "U0PERSON01", handle: null, real_name: null, display_name: null }, team_name: "Acme", workspace_name: "Acme Inc" }));
		expect((await describeSlackLink(TOKEN, "en-GB")).account).toBe('accountUnnamed {"id":"U0PERSON01","team":"Acme"}');
	});

	it("says why a link can't be used, including one already used", async () => {
		fetchMock.mockResolvedValueOnce(respond(409, { error: "link_used", message: "English text" }));
		expect(await describeSlackLink(TOKEN, "en-GB")).toEqual({ account: null, failure: "errors.used" });
		expect(await describeSlackLink("not a token", "en-GB")).toEqual({ account: null, failure: "errors.invalid" });
	});
});
