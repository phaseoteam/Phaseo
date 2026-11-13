import { describe, expect, it } from "vitest";
import type { DesktopFrame, PhoneCapability, PhoneResponse } from "@phaseo/phone-protocol";
import { fakePhoneHost } from "./fakePhoneHost";
import { issueDraftChars } from "./phoneChats";
import { PhoneHub } from "./phoneSession";

const connected = async (capabilities: PhoneCapability[] = ["code", "changes"]) => {
	const app = fakePhoneHost(), hub = new PhoneHub(app.host), frames: DesktopFrame[] = [];
	let allowed = capabilities;
	hub.capabilitiesOf = () => allowed;
	const session = hub.open({ id: "dev", name: "Daniel's Pixel" }, frame => frames.push(frame));
	let next = 0;
	const ask = async (request: object) => { const id = `r${next++}`; await session.receive(JSON.stringify({ id, ...request })); return frames.find(frame => "id" in frame && frame.id === id) as PhoneResponse; };
	await ask({ type: "hello", deviceId: "dev", appVersion: "0.1.0", protocol: 8 });
	return { app, ask, allow: (value: PhoneCapability[]) => { allowed = value; hub.accessChanged("dev"); } };
};
const commit = "c".repeat(40);
const build = { version: "0.1.0", platform: "android", commit, buildNumber: 2600, device: "Pixel 9", osVersion: "15" };

describe("triage from a phone", () => {
	it("needs Read code and Make changes before it fetches anything", async () => {
		for (const capabilities of [[], ["code"], ["changes"]] as PhoneCapability[][]) {
			const { app, ask } = await connected(capabilities);
			expect(await ask({ type: "triage", text: "Pairing hangs", build })).toMatchObject({ ok: false, error: { code: "forbidden" } });
			expect(app.triage.fetched).toEqual([]);
		}
	});

	it("starts a Code chat in the phone build's source, pointed at a playbook about the phone app", async () => {
		const { app, ask } = await connected();
		const answer = await ask({ type: "triage", text: "Pairing hangs on the code screen", build, diagnostics: "2026-11-12T10:00:00.000Z desktop.pair took 1500 ms" });
		expect(answer).toMatchObject({ ok: true, result: { commit, exact: true, chat: { mode: "code", title: "Triage: Pairing hangs on the code screen", project: "Phaseo mobile 0.1.0 source" } } });
		// The source is fetched at the phone's commit, not this app's.
		expect(app.triage.fetched).toEqual([commit]);
		const [playbook] = app.triage.playbooks;
		expect(playbook!.name).toMatch(/^\.phaseo-triage\/playbook-\d{8}-\d{6}-[0-9a-f]{8}\.md$/);
		expect(playbook!.content).toContain("# Triage a Phaseo mobile bug");
		expect(playbook!.content).toContain(`Phaseo for Android 0.1.0 (build 2600), built from commit ${commit}`);
		expect(playbook!.content).toContain("Pixel 9, Android 15");
		expect(playbook!.content).toContain("desktop.pair took 1500 ms");
		expect(playbook!.content).toContain("(\"Daniel's Pixel\")");
		expect(playbook!.content).toContain("Never file it yourself");
		// The first message links the playbook and carries what the person wrote, as the window's triage does.
		const chatId = (answer as { result: { chat: { id: string } } }).result.chat.id;
		const task = app.get(chatId);
		expect(task.projectId).toBe(app.projects.find(project => project.triage)!.id);
		expect(app.commands.find(command => command.type === "send" && command.id === chatId)).toMatchObject({ text: expect.stringMatching(/^Read @\[triage-playbook\.md\]\(file:\.phaseo-triage%2Fplaybook-\d{8}-\d{6}-[0-9a-f]{8}\.md\) and follow it\.\n\nPairing hangs on the code screen$/) });
		expect(app.git.notes).toEqual([{ device: "Daniel's Pixel", summary: "Started triaging a bug in the phone app", projectId: task.projectId }]);
	});

	it("reuses the checkout for the same build, and says when the source is main instead", async () => {
		const { app, ask } = await connected();
		await ask({ type: "triage", text: "One", build });
		await ask({ type: "triage", text: "Two", build });
		expect(app.projects.filter(project => project.triage)).toHaveLength(1);
		const loose = await ask({ type: "triage", text: "Three", build: { version: "0.1.0", platform: "android" } });
		expect(loose).toMatchObject({ ok: true, result: { exact: false } });
		expect(app.triage.playbooks.at(-1)!.content).toContain("This checkout is not the exact build");
	});

	it("passes on a failed fetch without starting a chat", async () => {
		const { app, ask } = await connected();
		app.triage.failure = "Could not reach phaseoteam/Phaseo on GitHub.";
		expect(await ask({ type: "triage", text: "x", build })).toMatchObject({ ok: false, error: { code: "rejected", message: "Could not reach phaseoteam/Phaseo on GitHub." } });
		expect(app.overview().tasks).toEqual([]);
	});
});

describe("a triage chat's issue draft on the phone", () => {
	const drafted = async (capabilities?: PhoneCapability[]) => {
		const context = await connected(capabilities);
		context.app.addTask({ id: "triage-1", title: "Triage: crash", mode: "code", projectId: "p1", issueDraft: { repository: "phaseoteam/Phaseo", title: "Pairing hangs", body: "Steps…", draftedAt: "2026-11-12T10:00:00.000Z", status: "draft" } });
		return context;
	};

	it("shows the draft with the chat, cut to a size the phone gets with every update", async () => {
		const { app, ask } = await drafted();
		expect(await ask({ type: "read_chat", chatId: "triage-1" })).toMatchObject({ ok: true, result: { chat: { issueDraft: { repository: "phaseoteam/Phaseo", title: "Pairing hangs", body: "Steps…", status: "draft" } } } });
		app.get("triage-1").issueDraft!.body = "x".repeat(issueDraftChars + 10);
		const long = await ask({ type: "read_chat", chatId: "triage-1" }) as { result: { chat: { issueDraft: { body: string; truncated?: true } } } };
		expect(long.result.chat.issueDraft.body).toHaveLength(issueDraftChars + 1);
		expect(long.result.chat.issueDraft.truncated).toBe(true);
	});

	it("files the draft through the window's File issue and answers with the filed issue", async () => {
		const { app, ask } = await drafted();
		expect(await ask({ type: "read_chat", chatId: "triage-1" })).toMatchObject({ ok: true, result: { chat: { issueDraft: { draftedAt: "2026-11-12T10:00:00.000Z" } } } });
		// A draft the agent replaced after the person read it is not filed.
		expect(await ask({ type: "issue_draft", chatId: "triage-1", action: "file", draftedAt: "2026-11-12T09:00:00.000Z" })).toMatchObject({ ok: false, error: { code: "rejected", message: "The agent replaced this issue draft. Read the new one before filing or discarding it." } });
		expect(await ask({ type: "issue_draft", chatId: "triage-1", action: "file", draftedAt: "2026-11-12T10:00:00.000Z" })).toMatchObject({ ok: true, result: { chat: { id: "triage-1", issueDraft: { status: "filed", number: 17, url: "https://github.com/phaseoteam/Phaseo/issues/17" } } } });
		expect(app.triage.issueActions).toEqual([{ chatId: "triage-1", action: "file" }, { chatId: "triage-1", action: "file" }]);
		// A second File is the window's refusal, passed on.
		expect(await ask({ type: "issue_draft", chatId: "triage-1", action: "file" })).toMatchObject({ ok: false, error: { code: "rejected", message: "This chat has no issue draft waiting." } });
	});

	it("needs Make changes to file or discard, since filing creates an issue on GitHub", async () => {
		const { app, ask, allow } = await drafted(["code"]);
		expect(await ask({ type: "issue_draft", chatId: "triage-1", action: "file" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
		expect(app.triage.issueActions).toEqual([]);
		allow(["code", "changes"]);
		expect(await ask({ type: "issue_draft", chatId: "triage-1", action: "discard" })).toMatchObject({ ok: true, result: { chat: { issueDraft: { status: "discarded" } } } });
	});
});
