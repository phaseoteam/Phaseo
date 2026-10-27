jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/flags", () => ({ slackAgentSettingsEnabled: jest.fn() }));
jest.mock("@/lib/fetchers/internal/serverAccountContext", () => ({ getServerAccountContext: jest.fn() }));

import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { slackAgentSettingsEnabled } from "@/lib/flags";
import {
	deleteSlackAgentNote,
	deleteSlackAgentSkill,
	loadSlackAgentMemory,
	removeSlackCustomApp,
	saveSlackCustomApp,
	startSlackInstall,
	startSlackPermissionsUpdate,
	uninstallSlackAgent,
	updateSlackAgent,
	updateSlackAgentSkill,
} from "./actions";

const mockEnabled = slackAgentSettingsEnabled as jest.MockedFunction<typeof slackAgentSettingsEnabled>;
const mockContext = getServerAccountContext as jest.MockedFunction<typeof getServerAccountContext>;
const fetchMock = jest.fn();

function respond(status: number, body: unknown) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
	jest.clearAllMocks();
	global.fetch = fetchMock as unknown as typeof fetch;
	mockEnabled.mockResolvedValue(true);
	mockContext.mockResolvedValue({ accessToken: "token-a", userId: "user-a", workspaceId: "workspace-a", obfuscateInfo: null });
});

describe("Slack settings actions", () => {
	it("do nothing while the Slack agent flag is off", async () => {
		mockEnabled.mockResolvedValue(false);
		for (const result of [await startSlackInstall({}), await startSlackPermissionsUpdate(), await updateSlackAgent({ model: "phaseo/auto" }), await uninstallSlackAgent(), await saveSlackCustomApp({}), await removeSlackCustomApp()]) {
			expect(result).toMatchObject({ ok: false, status: 404 });
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("needs a signed-in user", async () => {
		mockContext.mockResolvedValue({ accessToken: null, userId: null, workspaceId: "workspace-a", obfuscateInfo: null });
		expect(await updateSlackAgent({ model: "phaseo/auto" })).toEqual({ ok: false, status: 401, code: "unauthorized", message: null });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("sends the active workspace with the bearer token, which the body can't override", async () => {
		fetchMock.mockResolvedValue(respond(200, { installation: { id: "i", settings: {}, plan: { people: 3, price_usd: 0.99 } } }));
		const result = await updateSlackAgent({ model: "openai/gpt-5", workspaceId: "someone-else" });
		expect(result.ok).toBe(true);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toMatch(/\/api\/account\/settings\/slack$/);
		expect(init.method).toBe("PATCH");
		expect(init.headers.Authorization).toBe("Bearer token-a");
		expect(JSON.parse(init.body)).toEqual({ model: "openai/gpt-5", workspaceId: "workspace-a" });
	});

	it("keeps the API's error code apart from its message", async () => {
		fetchMock.mockResolvedValue(respond(409, { error: "payment_due", message: "Answers resume once last month's Slack agent charge is paid" }));
		expect(await updateSlackAgent({ status: "active" })).toEqual({
			ok: false, status: 409, code: "payment_due", message: "Answers resume once last month's Slack agent charge is paid",
		});
		fetchMock.mockResolvedValue(respond(503, { error: "settings_unavailable" }));
		expect(await uninstallSlackAgent()).toEqual({ ok: false, status: 503, code: "settings_unavailable", message: null });
	});

	it("only sends the browser to Slack's consent page", async () => {
		fetchMock.mockResolvedValue(respond(200, { url: "https://slack.com/oauth/v2/authorize?client_id=1.2&state=s" }));
		expect(await startSlackInstall({ plan_people: 3 })).toEqual({ ok: true, url: "https://slack.com/oauth/v2/authorize?client_id=1.2&state=s" });
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ plan_people: 3, workspaceId: "workspace-a" });
		fetchMock.mockResolvedValue(respond(200, { url: "https://example.com/oauth" }));
		expect(await startSlackInstall({})).toMatchObject({ ok: false, status: 502 });
	});

	it("starts a permissions update for the active workspace, and only to Slack's consent page", async () => {
		fetchMock.mockResolvedValue(respond(200, { url: "https://slack.com/oauth/v2/authorize?client_id=1.2&state=u" }));
		expect(await startSlackPermissionsUpdate()).toEqual({ ok: true, url: "https://slack.com/oauth/v2/authorize?client_id=1.2&state=u" });
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toMatch(/\/api\/account\/settings\/slack\/permissions$/);
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body)).toEqual({ workspaceId: "workspace-a" });
		fetchMock.mockResolvedValue(respond(200, { url: "https://example.com/oauth" }));
		expect(await startSlackPermissionsUpdate()).toMatchObject({ ok: false, status: 502 });
		fetchMock.mockResolvedValue(respond(404, { error: "not_installed" }));
		expect(await startSlackPermissionsUpdate()).toMatchObject({ ok: false, status: 404, code: "not_installed" });
	});

	it("saves and removes the company's Slack app for the active workspace", async () => {
		fetchMock.mockResolvedValue(respond(201, { custom_app: { id: "app", slack_app_id: "A0123", client_id: "1.2" } }));
		expect(await saveSlackCustomApp({ slack_app_id: "A0123" })).toMatchObject({ ok: true, customApp: { id: "app" } });
		expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
		fetchMock.mockResolvedValue(respond(409, { error: "slack_app_conflict", message: "Another admin saved a Slack app" }));
		expect(await saveSlackCustomApp({})).toMatchObject({ ok: false, code: "slack_app_conflict" });
		fetchMock.mockResolvedValue(respond(200, { deleted: true }));
		expect(await removeSlackCustomApp()).toEqual({ ok: true });
		expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ workspaceId: "workspace-a" });
	});

	it("reads the agent's memory for the active workspace, one kind or all", async () => {
		const memory = { notes: [], notes_total: 0, notes_used: 0, notes_limit: 500, skills: [], skills_limit: 100 };
		fetchMock.mockImplementation(async () => respond(200, memory));
		expect(await loadSlackAgentMemory("pin")).toEqual({ ok: true, memory });
		expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/account\/settings\/slack\/memory\?workspaceId=workspace-a&kind=pin$/);
		await loadSlackAgentMemory("all");
		await loadSlackAgentMemory("messages&workspaceId=other");
		expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/slack\/memory\?workspaceId=workspace-a$/);
		expect(String(fetchMock.mock.calls[2][0])).toMatch(/\/slack\/memory\?workspaceId=workspace-a$/);
	});

	it("deletes notes and edits or deletes skills by id only", async () => {
		const id = "00000000-0000-4000-8000-0000000000e1";
		fetchMock.mockImplementation(async () => respond(200, { id, deleted: true }));
		expect(await deleteSlackAgentNote(id)).toEqual({ ok: true });
		expect(await deleteSlackAgentSkill(id)).toEqual({ ok: true });
		expect(fetchMock.mock.calls.map(([url, init]) => [String(url).replace(/^.*\/api/, "/api"), init.method, JSON.parse(init.body)])).toEqual([
			[`/api/account/settings/slack/memory/notes/${id}`, "DELETE", { workspaceId: "workspace-a" }],
			[`/api/account/settings/slack/memory/skills/${id}`, "DELETE", { workspaceId: "workspace-a" }],
		]);
		fetchMock.mockResolvedValue(respond(200, { skill: { id, name: "Weekly summary" } }));
		expect(await updateSlackAgentSkill(id, { name: "Weekly summary", workspaceId: "someone-else" })).toMatchObject({ ok: true, skill: { name: "Weekly summary" } });
		expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ name: "Weekly summary", workspaceId: "workspace-a" });
		fetchMock.mockResolvedValue(respond(409, { error: "skill_name_taken", message: "Another saved skill has this name" }));
		expect(await updateSlackAgentSkill(id, { name: "Daily" })).toMatchObject({ ok: false, status: 409, code: "skill_name_taken" });

		fetchMock.mockClear();
		expect(await deleteSlackAgentNote("../../custom-app")).toMatchObject({ ok: false, status: 400, code: "bad_request" });
		expect(await deleteSlackAgentSkill(`${id}/x`)).toMatchObject({ ok: false, status: 400 });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
