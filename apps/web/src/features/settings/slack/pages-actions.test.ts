import { describe, it, expect, beforeEach, vi, type MockedFunction } from "vitest";
vi.mock("@/lib/flags", () => ({ slackAgentSettingsEnabled: vi.fn() }));
vi.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: vi.fn() }));

import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { slackAgentSettingsEnabled } from "@/lib/flags";
import { deleteSlackAgentPage, loadSlackAgentPages } from "./actions";

const mockEnabled = slackAgentSettingsEnabled as MockedFunction<typeof slackAgentSettingsEnabled>;
const mockContext = getServerAccountContext as MockedFunction<typeof getServerAccountContext>;
const fetchMock = vi.fn();
const PAGE_ID = "Q2hhcnRzQW5kVGFibGVzMQ";

function respond(status: number, body: unknown) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
	vi.clearAllMocks();
	global.fetch = fetchMock as unknown as typeof fetch;
	mockEnabled.mockResolvedValue(true);
	mockContext.mockResolvedValue({ accessToken: "token-a", userId: "user-a", workspaceId: "workspace-a", obfuscateInfo: null });
});

describe("Slack agent shared page actions", () => {
	it("read the active workspace's pages", async () => {
		const pages = { available: true, sign_in: false, pages: [], limit: 200 };
		fetchMock.mockResolvedValue(respond(200, pages));
		expect(await loadSlackAgentPages()).toEqual({ ok: true, pages });
		expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/account\/settings\/slack\/pages\?workspaceId=workspace-a$/);
		expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer token-a");
	});

	it("delete a page by its id only, and keep the API's error code", async () => {
		fetchMock.mockResolvedValue(respond(200, { id: PAGE_ID, deleted: true }));
		expect(await deleteSlackAgentPage({ data: PAGE_ID })).toEqual({ ok: true });
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toMatch(new RegExp(`/api/account/settings/slack/pages/${PAGE_ID}$`));
		expect(init.method).toBe("DELETE");
		expect(JSON.parse(init.body)).toEqual({ workspaceId: "workspace-a" });
		fetchMock.mockResolvedValue(respond(404, { error: "page_not_found", message: "It was deleted meanwhile" }));
		expect(await deleteSlackAgentPage({ data: PAGE_ID })).toMatchObject({ ok: false, status: 404, code: "page_not_found" });

		fetchMock.mockClear();
		expect(await deleteSlackAgentPage({ data: "../../custom-app" })).toMatchObject({ ok: false, status: 400, code: "bad_request" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("do nothing while the Slack agent flag is off", async () => {
		mockEnabled.mockResolvedValue(false);
		expect(await loadSlackAgentPages()).toMatchObject({ ok: false, status: 404 });
		expect(await deleteSlackAgentPage({ data: PAGE_ID })).toMatchObject({ ok: false, status: 404 });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
