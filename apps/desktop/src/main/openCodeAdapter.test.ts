import { describe, expect, it, vi } from "vitest";
import type { Task } from "../shared/workspace";
import type * as OpenCodeModule from "@opencode/client";
const sdk = vi.hoisted(() => ({ discover: vi.fn(), make: vi.fn() }));
vi.mock("@opencode/client", async importOriginal => ({ ...await importOriginal<typeof OpenCodeModule>(), OpenCode: { make: sdk.make } }));
vi.mock("@opencode/client/service", () => ({ Service: { discover: sdk.discover, headers: () => ({}) } }));
import { OpenCodeAdapter } from "./openCodeAdapter";
import { AgentInputRejectedError } from "./agentAdapter";

const task: Task = { id: "task", title: "Task", harness: "opencode", model: "default", mode: "code", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
describe("OpenCode 2 integration", () => {
	it("distinguishes rejected native steering from uncertain network delivery", async () => {
		sdk.discover.mockResolvedValue({ url: "http://localhost:4096" }); let prompted!: () => void; let complete!: () => void;
		const prompt = new Promise<void>(resolve => { prompted = resolve; }); const completed = new Promise<void>(resolve => { complete = resolve; });
		let count = 0; sdk.make.mockReturnValue({ session: { create: async () => ({ id: "session" }), wait: async () => {}, prompt: async (input: { delivery?: string }) => { if (!input.delivery) { prompted(); return; } if (++count === 1) throw { _tag: "InvalidRequestError", message: "Rejected input" }; throw new Error("Disconnected"); } }, event: { subscribe: async function* (options: { onActivity: () => void }) { options.onActivity(); await prompt; await completed; yield { type: "session.execution.succeeded", data: { sessionID: "session" } }; } } });
		const adapter = new OpenCodeAdapter(); const run = adapter.run(task, ".", "Start", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" }); await prompt;
		const message = { id: "instruction", text: "Change direction", createdAt: "" };
		await expect(adapter.steer(message, [])).rejects.toBeInstanceOf(AgentInputRejectedError); await expect(adapter.steer(message, [])).rejects.toThrow("Disconnected");
		complete(); await run;
	});
	it.each([true, false])("tracks steering accepted around native completion (%s)", async beforeCompletion => {
		sdk.discover.mockResolvedValue({ url: "http://localhost:4096" }); let prompted!: () => void; let complete!: () => void; let admit!: () => void; let firstIdle!: () => void; let secondIdle!: () => void;
		const prompt = new Promise<void>(resolve => { prompted = resolve; }); const completed = new Promise<void>(resolve => { complete = resolve; }); const admission = new Promise<void>(resolve => { admit = resolve; });
		const first = new Promise<void>(resolve => { firstIdle = resolve; }); const second = new Promise<void>(resolve => { secondIdle = resolve; });
		const wait = vi.fn().mockImplementationOnce(async () => first).mockImplementationOnce(async () => second);
		const submit = vi.fn(async (input: { delivery?: string }) => { if (input.delivery === "steer") await admission; else prompted(); });
		sdk.make.mockReturnValue({ session: { create: async () => ({ id: "session" }), prompt: submit, wait }, event: { subscribe: async function* (options: { onActivity: () => void }) { options.onActivity(); await prompt; await completed; yield { type: "session.execution.succeeded", data: { sessionID: "session" } }; } } });
		const adapter = new OpenCodeAdapter(); let finished = false; const run = adapter.run(task, ".", "Start", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" }).then(() => { finished = true; });
		await prompt;
		if (!beforeCompletion) { complete(); await vi.waitFor(() => expect(wait).toHaveBeenCalledOnce()); }
		const delivery = adapter.steer({ id: "message-identity", text: "Change direction", createdAt: "" }, []);
		if (beforeCompletion) { complete(); await vi.waitFor(() => expect(wait).toHaveBeenCalledOnce()); }
		firstIdle(); admit(); await delivery; await vi.waitFor(() => expect(wait).toHaveBeenCalledTimes(2)); expect(finished).toBe(false);
		expect(submit.mock.calls[1][0]).toMatchObject({ sessionID: "session", id: "msg_phaseomessageidentity", delivery: "steer", text: "Change direction" });
		secondIdle(); await run; await expect(adapter.steer({ id: "late", text: "Late", createdAt: "" }, [])).rejects.toThrow("not ready");
	});
	it("keeps streaming requests while native settlement waits for further work", async () => {
		sdk.discover.mockResolvedValue({ url: "http://localhost:4096" }); let prompted!: () => void; let idle!: () => void;
		const prompt = new Promise<void>(resolve => { prompted = resolve; }); const settlement = new Promise<void>(resolve => { idle = resolve; });
		const wait = vi.fn(async () => settlement); const reply = vi.fn(async () => { idle(); });
		sdk.make.mockReturnValue({ session: { create: async () => ({ id: "session" }), wait, prompt: async () => { prompted(); }, form: { reply } }, event: { subscribe: async function* (options: { onActivity: () => void }) {
			options.onActivity(); await prompt; yield { type: "session.execution.succeeded", data: { sessionID: "session" } };
			yield { type: "form.created", data: { form: { id: "later", sessionID: "session", title: "Further work", fields: [{ key: "name", type: "string" }] } } };
			yield { type: "session.text.delta", data: { sessionID: "session", assistantMessageID: "message", delta: "Further output" } };
			await settlement;
		} } });
		const onDelta = vi.fn(); await new OpenCodeAdapter().run(task, ".", "Start", { onDelta, onSession: vi.fn(), onApproval: async () => "decline", onForm: async () => ({ name: "Answer" }) });
		expect(wait).toHaveBeenCalledWith({ sessionID: "session" }, expect.anything()); expect(reply).toHaveBeenCalledOnce(); expect(onDelta).toHaveBeenCalledWith("message", "Further output");
	});
	it("rediscovers pending forms before resuming and deduplicates overlapping creation events", async () => {
		sdk.discover.mockResolvedValue({ url: "http://localhost:4096" });
		let answer!: (value: { count: number }) => void; let prompted!: () => void; let listed!: () => void;
		const prompt = new Promise<void>(resolve => { prompted = resolve; }); const listing = new Promise<void>(resolve => { listed = resolve; });
		const form = { id: "pending", sessionID: "session", title: "Recovered form", fields: [{ key: "count", type: "integer", default: 2 }] };
		const reply = vi.fn(async () => {}); const submit = vi.fn(async () => { prompted(); }); const switchAgent = vi.fn(async () => {}); const update = vi.fn(async () => {});
		sdk.make.mockReturnValue({ session: { get: async () => ({ id: "session" }), switchAgent, update, wait: async () => {}, prompt: submit, form: { list: async () => { listed(); return [form]; }, reply } }, event: { subscribe: async function* (options: { onActivity: () => void }) {
			options.onActivity(); await listing; yield { type: "form.created", data: { form } };
			yield { type: "session.execution.succeeded", data: { sessionID: "session" } };
			await prompt; yield { type: "session.execution.succeeded", data: { sessionID: "session" } };
		} } });
		const onForm = vi.fn(async () => new Promise<{ count: number }>(resolve => { answer = resolve; }));
		const run = new OpenCodeAdapter().run({ ...task, mode: "chat", nativeSessionId: "session" }, ".", "Continue", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline", onForm });
		await vi.waitFor(() => expect(answer).toBeDefined()); expect(submit).not.toHaveBeenCalled(); expect(onForm).toHaveBeenCalledOnce();
		answer({ count: 3 }); await run; expect(reply).toHaveBeenCalledWith({ sessionID: "session", formID: "pending", answer: { count: 3 } }, expect.anything()); expect(submit).toHaveBeenCalledOnce();
		expect(switchAgent).toHaveBeenCalledWith({ sessionID: "session", agent: "build" }, expect.anything()); expect(update).toHaveBeenCalledWith({ sessionID: "session", permissions: [{ action: "*", resource: "*", effect: "deny" }] }, expect.anything());
	});
	it.each([true, false])("handles native typed forms without blocking the event stream (%s)", async submit => {
		sdk.discover.mockResolvedValue({ url: "http://localhost:4096" });
		let promptResolve!: () => void; const prompt = new Promise<void>(resolve => { promptResolve = resolve; });
		let settled!: () => void; const answered = new Promise<void>(resolve => { settled = resolve; });
		const reply = vi.fn(async () => { settled(); }); const cancel = vi.fn(async () => { settled(); });
		sdk.make.mockReturnValue({ session: { create: async () => ({ id: "session" }), wait: async () => {}, prompt: async () => { promptResolve(); }, form: { reply, cancel } }, event: { subscribe: async function* (options: { onActivity: () => void }) {
			options.onActivity(); await prompt;
			yield { type: "form.created", data: { form: { id: "ignored", sessionID: "other", title: "Other", fields: [{ key: "name", type: "string" }] } } };
			yield { type: "form.created", data: { form: { id: "native-form", sessionID: "session", title: "Scope", fields: [{ key: "count", type: "integer", required: true }] } } };
			yield { type: "session.text.delta", data: { sessionID: "session", assistantMessageID: "message", delta: "Still streaming" } };
			await answered; yield { type: "session.execution.succeeded", data: { sessionID: "session" } };
		} } });
		const onForm = vi.fn(async () => submit ? { count: 3 } : null); const onDelta = vi.fn();
		await new OpenCodeAdapter().run(task, ".", "Hello", { onDelta, onSession: vi.fn(), onApproval: async () => "decline", onForm });
		expect(onForm).toHaveBeenCalledOnce(); expect(onDelta).toHaveBeenCalledWith("message", "Still streaming");
		if (submit) expect(reply).toHaveBeenCalledWith({ sessionID: "session", formID: "native-form", answer: { count: 3 } }, expect.anything());
		else expect(cancel).toHaveBeenCalledWith(expect.objectContaining({ formID: "native-form" }), expect.anything());
	});
	it("lets users retry native validation errors and aborts forms settled elsewhere", async () => {
		sdk.discover.mockResolvedValue({ url: "http://localhost:4096" });
		let prompted!: () => void; const prompt = new Promise<void>(resolve => { prompted = resolve; });
		let replied!: () => void; const done = new Promise<void>(resolve => { replied = resolve; });
		const reply = vi.fn().mockRejectedValueOnce({ _tag: "FormInvalidAnswerError", id: "form", message: "Use an ISO date." }).mockImplementationOnce(async () => { replied(); });
		sdk.make.mockReturnValue({ session: { create: async () => ({ id: "session" }), wait: async () => {}, prompt: async () => { prompted(); }, form: { reply } }, event: { subscribe: async function* (options: { onActivity: () => void }) {
			options.onActivity(); await prompt;
			yield { type: "form.created", data: { form: { id: "form", sessionID: "session", title: "Date", fields: [{ key: "date", type: "string" }] } } };
			await done;
			yield { type: "form.created", data: { form: { id: "external", sessionID: "session", title: "External", fields: [{ key: "name", type: "string" }] } } };
			yield { type: "form.cancelled", data: { id: "external", sessionID: "session" } };
			yield { type: "session.execution.succeeded", data: { sessionID: "session" } };
		} } });
		const onForm = vi.fn().mockResolvedValueOnce({ date: "bad" }).mockResolvedValueOnce({ date: "2026-10-03" }).mockImplementationOnce((_form, signal: AbortSignal) => new Promise(resolve => signal.addEventListener("abort", () => resolve(null), { once: true })));
		await new OpenCodeAdapter().run(task, ".", "Hello", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline", onForm });
		expect(onForm.mock.calls[1][0]).toMatchObject({ error: "Use an ISO date." }); expect(reply).toHaveBeenCalledTimes(2);
		expect(onForm.mock.calls[2][1].aborted).toBe(true);
	});
	it("requires a compatible service", async () => {
		sdk.discover.mockResolvedValue(undefined);
		await expect(new OpenCodeAdapter().run(task, ".", "Hello", { onSession: () => {}, onDelta: () => {}, onApproval: async () => "decline" })).rejects.toThrow("Start an OpenCode 2 service");
		expect(sdk.discover.mock.calls.at(-1)?.[0].version("1.18.31")).toBe(false);
	});
	it("subscribes before prompting and handles explicit permissions", async () => {
		sdk.discover.mockResolvedValue({ url: "http://localhost:4096" });
		let prompted = false;
		let promptResolve: () => void = () => {};
		const prompt = new Promise<void>(resolve => { promptResolve = resolve; });
		const reply = vi.fn(); const fork = vi.fn(async () => ({ id: "fork" })); const switchAgent = vi.fn(async () => {}); const update = vi.fn(async () => {});
		sdk.make.mockReturnValue({
			session: { fork, switchAgent, update, wait: async () => {}, prompt: vi.fn(async () => { prompted = true; promptResolve(); }) },
			permission: { reply },
			event: { subscribe: async function* (options: { onActivity: () => void }) {
				expect(prompted).toBe(false); options.onActivity(); await prompt;
				yield { type: "session.text.delta", data: { sessionID: "other", assistantMessageID: "ignored", delta: "wrong" } };
				yield { type: "permission.asked", data: { sessionID: "fork", id: "permission", action: "write", resources: ["file.ts"] } };
				yield { type: "session.text.delta", data: { sessionID: "fork", assistantMessageID: "message", delta: "Done" } };
				yield { type: "session.execution.succeeded", data: { sessionID: "fork" } };
			} },
		});
		const onDelta = vi.fn(); const onSession = vi.fn();
		await new OpenCodeAdapter().run({ ...task, nativeForkFrom: "source" }, ".", "Hello", { onDelta, onSession, onApproval: async () => "accept" });
		expect(fork).toHaveBeenCalledWith({ sessionID: "source" }, expect.anything());
		expect(switchAgent).toHaveBeenCalledWith({ sessionID: "fork", agent: "build" }, expect.anything()); expect(update).toHaveBeenCalledWith({ sessionID: "fork", permissions: [{ action: "*", resource: "*", effect: "ask" }] }, expect.anything());
		expect(onSession).toHaveBeenCalledWith("fork");
		expect(reply).toHaveBeenCalledWith({ sessionID: "fork", requestID: "permission", decision: "once" }, expect.anything());
		expect(onDelta).toHaveBeenCalledExactlyOnceWith("message", "Done");
	});
});
