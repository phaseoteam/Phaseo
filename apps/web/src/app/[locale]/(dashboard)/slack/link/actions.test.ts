jest.mock("next-intl/server", () => ({
	getTranslations: jest.fn(async () => (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key)),
}));
jest.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: jest.fn() }));

import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { confirmSlackLink } from "./actions";

const mockContext = getServerAccountContext as jest.MockedFunction<typeof getServerAccountContext>;
const fetchMock = jest.fn();
const TOKEN = "eyJpbnN0YWxsYXRpb25faWQiOiJ4In0.c2lnbmF0dXJl";

function respond(status: number, body: unknown) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
	jest.clearAllMocks();
	global.fetch = fetchMock as unknown as typeof fetch;
	mockContext.mockResolvedValue({ accessToken: "token-a", userId: "user-a", workspaceId: null, obfuscateInfo: null });
});

describe("Confirming a Slack account link", () => {
	it("posts only the token, as the signed-in user, and names the team and workspace", async () => {
		fetchMock.mockResolvedValue(respond(200, { linked: true, workspaceId: "w", workspace_name: "Acme Inc", team_name: "Acme" }));
		expect(await confirmSlackLink(TOKEN, "en-GB")).toEqual({ ok: true, title: "linkedTitle", message: 'linked {"team":"Acme","workspace":"Acme Inc"}' });
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toMatch(/\/api\/account\/settings\/slack\/link$/);
		expect(init.headers.Authorization).toBe("Bearer token-a");
		expect(JSON.parse(init.body)).toEqual({ token: TOKEN });
	});

	it("says why a link failed", async () => {
		for (const [error, key] of [["link_expired", "errors.expired"], ["link_invalid", "errors.invalid"], ["forbidden", "errors.wrongWorkspace"], ["not_installed", "errors.notInstalled"], ["settings_write_failed", "errors.failed"]]) {
			fetchMock.mockResolvedValueOnce(respond(error === "settings_write_failed" ? 503 : 400, { error, message: "English text" }));
			expect(await confirmSlackLink(TOKEN, "de-DE")).toEqual({ ok: false, title: "failedTitle", message: key });
		}
	});

	it("never calls the API without a well-formed token or a session", async () => {
		expect(await confirmSlackLink("not a token", "en-GB")).toMatchObject({ ok: false, message: "errors.invalid" });
		mockContext.mockResolvedValue({ accessToken: null, userId: null, workspaceId: null, obfuscateInfo: null });
		expect(await confirmSlackLink(TOKEN, "en-GB")).toMatchObject({ ok: false, message: "errors.signIn" });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
