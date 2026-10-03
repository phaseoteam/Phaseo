import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../shared/workspace";
import { PiRpc } from "./piRpc";
import type { PiRecord } from "./piRpc";
const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("./nativeProcess", () => ({ spawnNative: native.spawn }));
import { PiAdapter } from "./piAdapter";
import { AgentInputRejectedError } from "./agentAdapter";

function fixture(handle: (packet: PiRecord, send: (value: PiRecord) => void) => void) {
	const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
	let buffer = "";
	child.stdin.on("data", chunk => { buffer += chunk.toString(); let index: number; while ((index = buffer.indexOf("\n")) !== -1) { const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); handle(JSON.parse(line), value => child.stdout.write(`${JSON.stringify(value)}\n`)); } });
	native.spawn.mockResolvedValue(child); return child;
}
const task: Task = { id: "task", title: "Task", harness: "pi", model: "default", mode: "chat", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
describe("Pi native harness", () => {
	it("waits for late steering admission before finishing", async () => {
		let send!: (value: PiRecord) => void; let steerId: unknown; let stateId: unknown; let ready!: () => void;
		const started = new Promise<void>(resolve => { ready = resolve; }); let states = 0;
		fixture((packet, output) => {
			send = output;
			if (packet.type === "get_state") { states++; if(states===2) stateId=packet.id; else output({type:"response",id:packet.id,success:true,data:{sessionFile:"/session",isStreaming:false,pendingMessageCount:0}}); }
			if (packet.type === "prompt") { output({type:"response",id:packet.id,success:true,data:{disposition:"started"}}); ready(); }
			if (packet.type === "steer") { expect(packet.message).toBe("Late instruction"); steerId=packet.id; }
		});
		const adapter=new PiAdapter(); let finished=false; const run=adapter.run(task,"/project","Hello",{onDelta:vi.fn(),onSession:vi.fn(),onApproval:async()=>"decline"}).then(()=>{finished=true;}); await started;
		send({type:"agent_settled"}); await vi.waitFor(()=>expect(stateId).toBeDefined());
		const steering=adapter.steer({id:"instruction",text:"Late instruction",createdAt:""},[]); send({type:"response",id:stateId,success:true,data:{isStreaming:false,pendingMessageCount:0}}); await Promise.resolve(); expect(finished).toBe(false);
		send({type:"response",id:steerId,success:true,data:{disposition:"queued"}}); await steering; await run; expect(states).toBeGreaterThan(2);
		await expect(adapter.steer({id:"too-late",text:"Late instruction",createdAt:""},[])).rejects.toThrow("not accepting");
	});
	it("distinguishes native steering rejection from disconnect and clears native queues before abort", async () => {
		let pendingId: unknown; let ready!: () => void; const started=new Promise<void>(resolve=>{ready=resolve;}); const commands:unknown[]=[]; let attempts=0;
		fixture((packet,output)=>{commands.push(packet.type); if(packet.type==="get_state") output({type:"response",id:packet.id,success:true,data:{sessionFile:"/session"}}); if(packet.type==="prompt") {output({type:"response",id:packet.id,success:true,data:{disposition:"started"}});ready();} if(packet.type==="steer") {attempts++; if(attempts===1) output({type:"response",id:packet.id,success:false,error:"Rejected by native handler"}); else pendingId=packet.id;} if(packet.type==="clear_queue" || packet.type==="abort") output({type:"response",id:packet.id,success:true});});
		const adapter=new PiAdapter(); const run=adapter.run(task,"/project","Hello",{onDelta:vi.fn(),onSession:vi.fn(),onApproval:async()=>"decline"}); const stopped=expect(run).rejects.toThrow("stopped"); await started;
		await expect(adapter.steer({id:"reject",text:"Reject",createdAt:""},[])).rejects.toBeInstanceOf(AgentInputRejectedError);
		const uncertain=adapter.steer({id:"uncertain",text:"Uncertain",createdAt:""},[]); const uncertainRejected=expect(uncertain).rejects.not.toBeInstanceOf(AgentInputRejectedError); expect(pendingId).toBeDefined(); await adapter.cancel(); await stopped; await uncertainRejected; expect(commands.slice(-2)).toEqual(["clear_queue","abort"]);
	});
	it("waits past agent_end and compaction, preserves native forks and streams extension dialogs", async () => {
		let stateCalls = 0; let send!: (value: PiRecord) => void; let promptStarted!: () => void;
		const started = new Promise<void>(resolve => { promptStarted = resolve; });
		const child = fixture((packet, output) => {
			send = output;
			if (packet.type === "get_state") { stateCalls++; output({ type: "response", id: packet.id, success: true, data: { sessionFile: "/sessions/fork.jsonl", isStreaming: false, isCompacting: stateCalls === 2 } }); }
			if (packet.type === "prompt") {
				expect(packet.images).toEqual([{ type: "image", data: "YWJj", mimeType: "image/png" }]);
				output({ type: "response", id: packet.id, success: true, data: { disposition: "started" } });
				output({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hello" } });
				output({ type: "extension_ui_request", id: "question", method: "input", title: "Name" });
				output({ type: "agent_end" }); promptStarted();
			}
		});
		const onDelta = vi.fn(); const onSession = vi.fn(); const onQuestion = vi.fn(async () => ({ question: ["Answer"] }));
		let settled = false;
		const run = new PiAdapter().run({ ...task, nativeForkFrom: "/sessions/original.jsonl" }, "/project", "Hello", { onDelta, onSession, onQuestion, onApproval: async () => "decline" }, undefined, [{ id: "image", taskId: "task", name: "image.png", kind: "image", mimeType: "image/png", size: 3, filePath: "/image", dataUrl: "data:image/png;base64,YWJj" }]).then(() => { settled = true; });
		await started; await Promise.resolve(); expect(settled).toBe(false);
		send({ type: "agent_settled" }); await run;
		expect(stateCalls).toBe(3); expect(onDelta).toHaveBeenCalledExactlyOnceWith("assistant", "Hello"); expect(onSession).toHaveBeenCalledWith("/sessions/fork.jsonl"); expect(onQuestion).toHaveBeenCalled(); expect(child.kill).toHaveBeenCalled();
		expect(native.spawn.mock.lastCall?.[1]).toEqual(["--mode", "rpc", "--fork", "/sessions/original.jsonl", "--no-tools"]);
	});
	it("does not launch native code tools when their turn approval is declined", async () => {
		native.spawn.mockClear();
		await expect(new PiAdapter().run({ ...task, mode: "code" }, "/project", "Edit", { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" })).rejects.toThrow("declined");
		expect(native.spawn).not.toHaveBeenCalled();
	});
	it("decodes fragmented Unicode and fails pending requests on disconnect", async () => {
		const input = new PassThrough(); const output = new PassThrough(); const rpc = new PiRpc(input, output); const onEvent = vi.fn(); rpc.onEvent = onEvent;
		for (const byte of Buffer.from(JSON.stringify({ type: "message_update", text: "Hello 🌍\u2028world" }) + "\n")) input.write(Buffer.from([byte]));
		expect(onEvent).toHaveBeenCalledWith({ type: "message_update", text: "Hello 🌍\u2028world" });
		const request = rpc.request({ type: "get_state" }); const rejected = expect(request).rejects.toThrow("connection ended"); input.end(); await rejected;
	});
});
