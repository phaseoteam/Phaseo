import { describe, expect, it } from "vitest";
import { appendFileSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { WorkspaceStore } from "./workspaceStore";
import type { Task } from "../shared/workspace";

/**
 * Store load test: eight chats streaming at once into long histories while the window reads pages, the chat list and
 * search, and a second connection writes from another thread. Run with STORE_BENCH=1 (STORE_BENCH_OUT=<file> appends
 * the report there). Every operation goes through the store's public methods, so the same test measures any schema.
 */
const enabled = Boolean(process.env.STORE_BENCH);
const smallChats = Number(process.env.STORE_BENCH_CHATS ?? 2000), streams = 8, longTurns = Number(process.env.STORE_BENCH_TURNS ?? 1500), flushes = Number(process.env.STORE_BENCH_FLUSHES ?? 1200);
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 16) - minutes * 60_000).toISOString();
const answer = (n: number) => `Here is part ${n}.\n\n1. **Inputs** – what arrives.\n2. **Processing** – retries per provider.\n\n| Step | Cost |\n| --- | --- |\n| Read | $0.002 |\n\n\`\`\`ts\nexport const handle${n} = (request: Request) => route(request, { attempt: ${n} });\n\`\`\`\n\n${"Detail ".repeat(120)}`;

function chat(id: string, turns: number, code: boolean, age: number) {
	const messages: Task["messages"] = [], activities: NonNullable<Task["activities"]> = [];
	for (let n = 1; n <= turns; n++) {
		const order = n * 20, user = `${id}-u${n}`;
		messages.push({ id: user, role: "user", text: `Question ${n} about the billing export.`, createdAt: at(age + turns - n), completedAt: at(age + turns - n), timelineOrder: order });
		if (code) for (let step = 0; step < 6; step++) activities.push({ id: `${user}:t${step}`, type: "tool", title: "read_project_file", text: `src/module-${n}-${step}.ts`, status: "completed", timelineOrder: order + 1 + step });
		messages.push({ id: `${id}-a${n}`, role: "assistant", text: answer(n), createdAt: at(age + turns - n), timelineOrder: order + 19 });
	}
	return { id, title: `Chat ${id}`, harness: "codex", model: "default", mode: code ? "code" : "chat", status: "completed", pinned: false, archived: false, queue: [], messages, activities, createdAt: at(age + turns), updatedAt: at(age) } as unknown as Task;
}

const stats = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b), pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0; return { n: values.length, p50: +pick(0.5).toFixed(2), p95: +pick(0.95).toFixed(2), max: +(sorted.at(-1) ?? 0).toFixed(2), total: +values.reduce((sum, value) => sum + value, 0).toFixed(1) }; };

describe.skipIf(!enabled)("store under concurrent load", () => {
	it("streams into eight long chats while reading and writing from a second connection", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-store-bench-")), filename = path.join(directory, "workspace.sqlite");
		let opened: WorkspaceStore | undefined;
		const report: string[] = [], time = new Map<string, number[]>(), record = (name: string, run: () => unknown) => { const started = performance.now(); const value = run(); (time.get(name) ?? time.set(name, []).get(name)!).push(performance.now() - started); return value; };
		try {
			// History written the way any earlier build left it: one row per chat with its whole conversation inside.
			const seed = new DatabaseSync(filename);
			seed.exec("PRAGMA journal_mode=WAL; CREATE TABLE tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
			const insert = seed.prepare("INSERT INTO tasks VALUES (?, ?)");
			seed.exec("BEGIN");
			for (let index = 0; index < smallChats; index++) insert.run(`small-${index}`, JSON.stringify(chat(`small-${index}`, 3 + index % 12, index % 3 === 0, 600 + index * 30)));
			const long = Array.from({ length: streams }, (_, index) => `long-${index}`);
			for (const [index, id] of long.entries()) insert.run(id, JSON.stringify(chat(id, longTurns, index % 2 === 0, index)));
			seed.exec("COMMIT"); seed.close();
			report.push(`history: ${smallChats + streams} chats, ${(statSync(filename).size / 1024 / 1024).toFixed(1)} MB; ${streams} long chats of ${longTurns} turns`);

			let store!: WorkspaceStore;
			record("first open (upgrade)", () => { opened = store = new WorkspaceStore(filename); store.getOverview(); });
			const raw = (store as unknown as { db: DatabaseSync }).db;
			raw.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA wal_autocheckpoint=0");
			const walBefore = statSync(`${filename}-wal`).size;

			// The second connection: another thread writing its own rows every few milliseconds.
			const worker = new Worker(`
				const { parentPort, workerData } = require("node:worker_threads");
				const { DatabaseSync } = require("node:sqlite");
				const db = new DatabaseSync(workerData.filename);
				db.exec("PRAGMA busy_timeout=5000; PRAGMA wal_autocheckpoint=0");
				db.exec("CREATE TABLE IF NOT EXISTS bench_side (id INTEGER PRIMARY KEY, data TEXT)");
				let writes = 0, busy = 0, stop = false;
				parentPort.on("message", () => { stop = true; });
				const loop = () => { if (stop) { db.close(); parentPort.postMessage({ writes, busy }); return; }
					try { db.prepare("INSERT INTO bench_side (data) VALUES (?)").run("x".repeat(2000)); writes++; } catch (error) { if (/locked|busy/i.test(String(error))) busy++; else throw error; }
					setTimeout(loop, 3); };
				loop();`, { eval: true, workerData: { filename } });
			const sideDone = new Promise<{ writes: number; busy: number }>(resolve => worker.once("message", resolve));

			// What each long chat must hold afterwards: its message count, current turn and the text streamed into its last answer.
			const expected = new Map(long.map(id => [id, { messages: longTurns * 2, turn: `${id}-u${longTurns}`, appended: 0 }]));
			const tailed = (store as unknown as { getTaskTail?: (id: string, from: string) => Task }).getTaskTail?.bind(store);
			let mainBusy = 0;
			const guarded = (name: string, run: () => unknown) => { try { return record(name, run); } catch (error) { if (/locked|busy/i.test(String(error))) { mainBusy++; return undefined; } throw error; } };
			const started = performance.now();
			for (let flush = 0; flush < flushes; flush++) {
				const id = long[flush % streams];
				// A streaming flush, as the runtime does it: read the chat, append the delta, save it.
				// Each chat starts a new turn every 40 of its own flushes (a real reply streams for many more).
				const starts = Math.floor(flush / streams) % 40 === 0;
				guarded(starts ? "turn start" : "stream flush", () => {
					const state = expected.get(id)!;
					// A turn starts from the whole chat; its flushes read only that turn when the store can.
					const task = starts || !tailed ? store.getTask(id) : tailed(id, state.turn);
					if (starts) {
						const n = task.messages.length + 1, order = (task.messages.at(-1)?.timelineOrder ?? 0) + 20;
						task.messages.push({ id: `${id}-live-u${n}`, role: "user", text: "Next question", createdAt: at(0), timelineOrder: order });
						for (let step = 0; step < 6; step++) task.activities!.push({ id: `${id}-live-u${n}:t${step}`, type: "tool", title: "Search", text: "results", status: "completed", timelineOrder: order + 1 + step });
						task.messages.push({ id: `${id}-live-a${n}`, role: "assistant", text: "", createdAt: at(0), timelineOrder: order + 19 });
						state.turn = `${id}-live-u${n}`; state.messages += 2; state.appended = 0;
					}
					state.appended++;
					task.messages.at(-1)!.text += "streamed words arrive in small pieces ".repeat(4);
					store.saveTask(task);
				});
				// What the window reads meanwhile.
				const other = long[(flush * 5 + 3) % streams];
				switch (flush % 4) {
					case 0: guarded("chat list", () => store.getOverview()); break;
					case 1: guarded("open chat", () => store.getTaskView(other)); break;
					case 2: { const page = store.conversationPage({ taskId: other, kind: "messages", limit: 50 }) as { entries: { id: string }[] }; guarded("page back", () => store.conversationPage({ taskId: other, kind: "messages", limit: 50, beforeId: page.entries[0].id })); break; }
					case 3: if (flush % 40 === 3) guarded("search", () => store.taskHistory({ query: "billing", archived: false, offset: 0, limit: 50 })); else guarded("chat list", () => store.getOverview()); break;
				}
				// Yield like the event loop does, so the other thread's writes interleave.
				if (flush % 8 === 7) await new Promise(resolve => setImmediate(resolve));
			}
			const wall = performance.now() - started;
			worker.postMessage("stop"); const side = await sideDone;
			const walBytes = statSync(`${filename}-wal`).size - walBefore;
			const flushStats = stats(time.get("stream flush")!);
			report.push(`${flushes} flushes over ${streams} chats in ${(wall / 1000).toFixed(1)} s`);
			for (const [name, values] of time) report.push(`${name.padEnd(22)} ${JSON.stringify(stats(values))}`);
			// Eight chats streaming, each flushing every 40 ms, is 200 flushes a second; this is the main-thread share they need.
			report.push(`main thread for 8 streams at 25 flushes/s each: ${Math.round(flushStats.total / flushStats.n * 200 / 10)}% of one thread (mean flush ${(flushStats.total / flushStats.n).toFixed(2)} ms)`);
			report.push(`written to the WAL: ${(walBytes / 1024 / 1024).toFixed(1)} MB (${(walBytes / flushes / 1024).toFixed(0)} KB per flush)`);
			report.push(`second connection: ${side.writes} writes, ${side.busy} locked; main thread locked: ${mainBusy}`);
			const integrity = raw.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
			report.push(`integrity: ${integrity.integrity_check}`);
			// The data must survive: every long chat keeps all its turns plus the streamed ones.
			for (const id of long) {
				const task = store.getTask(id), state = expected.get(id)!, seeded = chat(id, longTurns, long.indexOf(id) % 2 === 0, long.indexOf(id));
				expect(task.messages.length).toBe(state.messages);
				expect(task.messages.at(-1)!.text.split("streamed words").length - 1).toBe(state.appended * 4);
				expect(task.messages.slice(0, longTurns * 2).map(message => message.id)).toEqual(seeded.messages.map(message => message.id));
				expect(task.messages[10].text).toBe(seeded.messages[10].text);
			}
			report.push("data check: every long chat holds every seeded and streamed message, in order, with every appended piece");
			expect(integrity.integrity_check).toBe("ok");
		} finally {
			const text = report.join("\n");
			console.log(text);
			if (process.env.STORE_BENCH_OUT) appendFileSync(process.env.STORE_BENCH_OUT, `${process.env.STORE_BENCH_LABEL ?? "run"}\n${text}\n\n`);
			try { opened?.close(); } catch { /* already closed */ }
			rmSync(directory, { recursive: true, force: true });
		}
	}, 1_800_000);
});
