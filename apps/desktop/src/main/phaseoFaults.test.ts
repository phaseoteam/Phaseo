import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGatewayAgentClient } from "@phaseo/agent-sdk";
import type { Account, Task } from "../shared/workspace";
import { WorkspaceStore } from "./workspaceStore";
import { PhaseoCodingAdapter, phaseoGatewayClientOptions } from "./phaseoCodingAdapter";
import { PhaseoAdapter } from "./phaseoAdapter";

/** The load gateway fixture with a fault plan: one fault per model request, in order. */
async function gateway(faults: string[]) {
	const port = 20000 + Math.floor(Math.random() * 20000);
	const child = spawn(process.execPath, [path.join(__dirname, "../../scripts/fixtures/load-gateway.mjs"), `--port=${port}`, "--seconds=0.3", "--rate=20", `--faults=${faults.join(",")}`], { stdio: ["ignore", "pipe", "inherit"] });
	await new Promise<void>((resolve, reject) => { child.stdout!.on("data", chunk => { if (String(chunk).includes("load gateway on")) resolve(); }); child.once("exit", code => reject(new Error(`Gateway exited with ${code}`))); });
	const stats = async () => (await (await fetch(`http://127.0.0.1:${port}/stats`)).json()) as { faults: string[] };
	return { child, endpoint: `http://127.0.0.1:${port}/v1`, stats };
}

let running: ChildProcess | undefined;
afterEach(() => { running?.kill(); running = undefined; });

describe("Phaseo turns against a failing gateway", () => {
	it("retries rate limits, outages, dropped and stalled starts, and recovers from failures partway through", { timeout: 60_000 }, async () => {
		const server = await gateway(["429", "503", "drop-early", "ok", "drop", "stall-early", "ok", "error", "ok"]); running = server.child;
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-faults-")), store = new WorkspaceStore(path.join(root, "state.sqlite"));
		const account: Account = { id: "account", name: "API", harness: "phaseo", kind: "api", configured: true, endpoint: server.endpoint };
		let task: Task = { id: "faults", title: "Faults", harness: "phaseo", model: "openai/gpt-6.1-sol", mode: "code", status: "running", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
		// A short idle window stands in for the three minutes the app allows.
		const factory = (value: Account, key: string, current: Task) => createGatewayAgentClient({ ...phaseoGatewayClientOptions(value, key, current), streamIdleTimeoutMs: 400 });
		const turn = async (text: string) => {
			let answer = "", session = task.nativeSessionId; const activities: { title: string }[] = [];
			const messages = [...task.messages, { id: `user:${text}`, role: "user" as const, text, createdAt: "" }];
			const outcome = await new PhaseoCodingAdapter(() => "key", store, factory).run({ ...task, messages }, root, text, { onSession: id => { session = id; }, onDelta: (_id, delta) => { answer += delta; }, onApproval: async () => "accept", onActivity: activity => activities.push(activity) }, account).then(() => "completed", (error: Error) => error.message);
			task = { ...task, nativeSessionId: session, messages: [...messages, ...answer ? [{ id: `assistant:${text}`, role: "assistant" as const, text: answer, createdAt: "" }] : []] };
			return { outcome, answer, retries: activities.filter(activity => activity.title === "Retrying the model request").length };
		};
		try {
			const first = await turn("One");
			expect(first).toMatchObject({ outcome: "completed", retries: 3 });
			expect(first.answer).toMatch(/^Streaming keeps/);
			// Output already on screen cannot be retried, so a drop partway through fails the turn but keeps the chat usable.
			const dropped = await turn("Two");
			expect(dropped.outcome).toMatch(/dropped before the response finished/);
			expect(dropped.answer.length).toBeGreaterThan(0);
			const stalled = await turn("Three");
			expect(stalled).toMatchObject({ outcome: "completed", retries: 1 });
			const errored = await turn("Four");
			expect(errored.outcome).toBe("The upstream provider reset the connection.");
			expect(await turn("Five")).toMatchObject({ outcome: "completed", retries: 0 });
			expect((await server.stats()).faults).toEqual(["429", "503", "drop-early", "ok", "drop", "stall-early", "ok", "error", "ok"]);
			expect(store.loadAgentRun(task.nativeSessionId!)?.run.status).toBe("completed");
		} finally { store.close(); rmSync(root, { recursive: true, force: true }); }
	});

	it("gives Chat the same retries and keeps the gateway's explanation", { timeout: 60_000 }, async () => {
		const server = await gateway(["429", "500", "ok", "401"]); running = server.child;
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-chat-faults-")), store = new WorkspaceStore(path.join(root, "state.sqlite"));
		const account: Account = { id: "account", name: "API", harness: "phaseo", kind: "api", configured: true, endpoint: server.endpoint };
		const task: Task = { id: "chat-faults", title: "Faults", harness: "phaseo", model: "openai/gpt-6.1-sol", mode: "chat", status: "running", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
		try {
			const onDelta = vi.fn(), onActivity = vi.fn();
			await new PhaseoAdapter(() => "key", fetch, undefined, store).run(task, root, "Hello", { onSession: () => {}, onDelta, onApproval: async () => "accept", onActivity }, account);
			expect(onDelta).toHaveBeenCalled();
			expect(onActivity.mock.calls.filter(([activity]) => activity.title === "Retrying the model request")).toHaveLength(2);
			// The fourth request is refused outright, which is not worth retrying; the gateway's own message is shown.
			await expect(new PhaseoAdapter(() => "key", fetch, undefined, store).run({ ...task, id: "chat-refused" }, root, "Again", { onSession: () => {}, onDelta: () => {}, onApproval: async () => "accept" }, account)).rejects.toThrow("The upstream provider is unavailable.");
		} finally { store.close(); rmSync(root, { recursive: true, force: true }); }
	});
});
