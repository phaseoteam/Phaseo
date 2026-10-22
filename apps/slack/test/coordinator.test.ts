import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadCoordinator, TURN_TIMEOUT_MS, type TurnRequest } from "../src/coordinator";
import { createWorkflowTurnRunner, type TurnRef, type TurnRunner, type TurnStart } from "../src/turns";
import { fakeState, FakeStorage, INSTALLATION_ID, storageOf, testWorld, WORKSPACE_ID, type TestWorld } from "./fakes";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const DAY = 24 * 60 * 60_000;
const KEY = `${INSTALLATION_ID}:C0CHANNEL1:1792600000.000100`;

class RecordingRunner implements TurnRunner {
	starts: TurnRef[] = [];
	next: TurnStart = { started: true };
	async start(turn: TurnRef): Promise<TurnStart> {
		this.starts.push(turn);
		return this.next;
	}
}

let world: TestWorld;
let coordinator: ThreadCoordinator;
let runner: RecordingRunner;

function request(eventId: string, overrides: Partial<TurnRequest> = {}): TurnRequest {
	return {
		threadKey: KEY,
		eventId,
		installationId: INSTALLATION_ID,
		teamId: "T0TEST0001",
		channel: "C0CHANNEL1",
		threadTs: "1792600000.000100",
		messageTs: "1792600000.000100",
		slackUserId: "U0PERSON01",
		kind: "mention",
		text: `message for ${eventId}`,
		...overrides,
	};
}

/** Holds a place in the meter for an event, as the Worker does before queueing. */
function admitInMeter(eventId: string) {
	const meter = world.meters.get(world.meters.idFromName(INSTALLATION_ID));
	meter.admit({
		settings: { id: INSTALLATION_ID, workspace_id: WORKSPACE_ID, status: "active", plan_people: 100, over_plan: "refuse", max_people: null, monthly_cap_nanos: 100_000_000_000, answers_per_person_hour: 60, allow_guests: true, allow_external_users: false },
		slackUserId: "U0PERSON01",
		facts: { isBot: false, isExternal: false, isGuest: false },
		eventId,
		now: NOW,
	});
	return meter;
}

beforeEach(() => {
	world = testWorld({ now: NOW });
	coordinator = world.threads.get(world.threads.idFromName(KEY));
	runner = new RecordingRunner();
	coordinator.runner = runner;
});

afterEach(() => {
	vi.useRealTimers();
});

describe("ThreadCoordinator", () => {
	it("claims each event id once", async () => {
		await expect(coordinator.claimEvent("Ev0TEST0001", NOW)).resolves.toBe(true);
		await expect(coordinator.claimEvent("Ev0TEST0001", NOW + 1_000)).resolves.toBe(false);
		await expect(coordinator.claimEvent("Ev0TEST0002", NOW)).resolves.toBe(true);
	});

	it("runs one turn at a time and starts queued follow-ups when the turn reports back", async () => {
		await expect(coordinator.enqueue(request("Ev0TEST0001"), NOW)).resolves.toEqual({ status: "started", turnId: 1, position: 0 });
		await expect(coordinator.enqueue(request("Ev0TEST0002"), NOW)).resolves.toEqual({ status: "queued", turnId: 2, position: 1 });
		await expect(coordinator.enqueue(request("Ev0TEST0003"), NOW)).resolves.toEqual({ status: "queued", turnId: 3, position: 2 });
		expect(runner.starts.map((turn) => turn.eventId)).toEqual(["Ev0TEST0001"]);
		expect(runner.starts[0]).toEqual({
			turnId: 1, threadKey: KEY, eventId: "Ev0TEST0001", installationId: INSTALLATION_ID, teamId: "T0TEST0001",
			channel: "C0CHANNEL1", threadTs: "1792600000.000100", messageTs: "1792600000.000100", slackUserId: "U0PERSON01", kind: "mention",
		});

		await expect(coordinator.finishTurn(1, { status: "done", reply: "First answer" }, NOW + 1_000)).resolves.toEqual({ ok: true });
		expect(runner.starts.map((turn) => turn.eventId)).toEqual(["Ev0TEST0001", "Ev0TEST0002"]);
		expect(coordinator.status()).toMatchObject({ running: 2, queued: 1 });
		// A late or repeated callback changes nothing.
		await expect(coordinator.finishTurn(1, { status: "done" }, NOW + 2_000)).resolves.toEqual({ ok: false });
		expect(runner.starts).toHaveLength(2);
	});

	it("keeps a message only while its turn is open", async () => {
		await coordinator.enqueue(request("Ev0TEST0001"), NOW);
		expect(coordinator.turnInput(1)).toEqual({ text: "message for Ev0TEST0001", context: null, replyTs: null, stagedReply: null, stagedTools: [], attemptCosts: {}, memory: [] });
		await coordinator.finishTurn(1, { status: "done", reply: "Answer" }, NOW);
		expect(coordinator.turnInput(1)).toBeNull();
		const storage = storageOf(coordinator);
		expect(storage.db.prepare("SELECT count(*) AS count FROM turns").all()[0]).toEqual({ count: 0 });
	});

	it("keeps the bot's replies and short tool summaries as working memory", async () => {
		await coordinator.enqueue(request("Ev0TEST0001"), NOW);
		await coordinator.finishTurn(1, { status: "done", reply: "  Spend was $12.50.  ", tools: ["get_spend: 5 weeks by week", "", "x".repeat(500)] }, NOW);
		expect(coordinator.workingMemory()).toEqual([
			{ kind: "tool", text: "get_spend: 5 weeks by week", at: NOW, ts: null },
			{ kind: "tool", text: "x".repeat(200), at: NOW, ts: null },
			{ kind: "reply", text: "Spend was $12.50.", at: NOW, ts: null },
		]);
		for (let index = 2; index <= 25; index += 1) {
			await coordinator.enqueue(request(`Ev0TEST${String(index).padStart(4, "0")}`), NOW);
			// The reply's Slack message goes with it, and joins the thread's known messages.
			coordinator.setReplyTs(index, `1792600100.${String(index).padStart(6, "0")}`);
			await coordinator.finishTurn(index, { status: "done", reply: `reply ${index}` }, NOW);
		}
		const memory = coordinator.workingMemory();
		expect(memory).toHaveLength(20);
		expect(memory.at(-1)).toEqual({ kind: "reply", text: "reply 25", at: NOW, ts: "1792600100.000025" });
		// At most 20 timestamps, the newest.
		expect(coordinator.knownMessages()).toHaveLength(20);
		expect(coordinator.knownMessages()[0]).toBe("1792600100.000006");
	});

	it("knows which thread messages follow one another, from each turn's read", async () => {
		const ts = (n: number) => `1792600000.${String(n).padStart(6, "0")}`;
		let events = 0;
		/** Starts a turn for a message, records its read, and ends it (with a reply message, if given). */
		const turn = async (messageTs: string, read: Parameters<ThreadCoordinator["recordThreadRead"]>[1], replyTs?: string) => {
			events += 1;
			const started = await coordinator.enqueue(request(`Ev0TEST${String(events).padStart(4, "0")}`, { messageTs }), NOW);
			if (started.status !== "started") throw new Error("turn did not start");
			coordinator.recordThreadRead(started.turnId, read);
			const known = coordinator.knownMessages();
			if (replyTs) coordinator.setReplyTs(started.turnId, replyTs);
			await coordinator.finishTurn(started.turnId, { status: "done", reply: "Answer" }, NOW);
			return known;
		};

		await expect(turn(ts(500), { oldest: ts(100), ts: [ts(100), ts(200), ts(300), ts(500)], complete: true }, ts(600))).resolves.toEqual([ts(100), ts(200), ts(300), ts(500)]);
		// The reply joins them when the turn ends.
		expect(coordinator.knownMessages()).toEqual([ts(100), ts(200), ts(300), ts(500), ts(600)]);

		// A complete read from a known message: what it returned replaces what was known there (400 was written meanwhile, 500 deleted).
		await expect(turn(ts(800), { oldest: ts(300), ts: [ts(300), ts(400), ts(600), ts(700), ts(800)], complete: true }))
			.resolves.toEqual([ts(100), ts(200), ts(300), ts(400), ts(600), ts(700), ts(800)]);

		// A complete read that started at a time, not a known message: what came before it may have a gap.
		await expect(turn(ts(820), { oldest: ts(750), ts: [ts(800), ts(810), ts(820)], complete: true })).resolves.toEqual([ts(800), ts(810), ts(820)]);

		// A failed read: only the turn's own message, and anything known after it, stay.
		await expect(turn(ts(650), null)).resolves.toEqual([ts(650), ts(800), ts(810), ts(820)]);
		// A partial one: the same.
		await expect(turn(ts(900), { oldest: ts(650), ts: [ts(650), ts(700), ts(800), ts(900)], complete: false })).resolves.toEqual([ts(900)]);
	});

	it("records the Connect button once per person in a thread, and gives it back when it wasn't delivered", () => {
		expect(coordinator.claimLinkOffer("U0PERSON01", NOW)).toBe(true);
		expect(coordinator.claimLinkOffer("U0PERSON01", NOW)).toBe(false);
		expect(coordinator.claimLinkOffer("U0PERSON02", NOW)).toBe(true);
		coordinator.releaseLinkOffer("U0PERSON01");
		expect(coordinator.claimLinkOffer("U0PERSON01", NOW)).toBe(true);
	});

	it("refuses a duplicate turn and a full queue", async () => {
		await coordinator.enqueue(request("Ev0TEST0001"), NOW);
		await expect(coordinator.enqueue(request("Ev0TEST0001"), NOW)).resolves.toEqual({ status: "duplicate" });
		for (let index = 2; index <= 6; index += 1) {
			await expect(coordinator.enqueue(request(`Ev0TEST000${index}`), NOW)).resolves.toMatchObject({ status: "queued" });
		}
		await expect(coordinator.enqueue(request("Ev0TEST0007"), NOW)).resolves.toEqual({ status: "queue_full" });
	});

	it("cancel flags the running turn and drops queued ones, giving their places back to the meter", async () => {
		for (const eventId of ["Ev0TEST0001", "Ev0TEST0002", "Ev0TEST0003"]) admitInMeter(eventId);
		const meter = world.meters.get(world.meters.idFromName(INSTALLATION_ID));
		for (const eventId of ["Ev0TEST0001", "Ev0TEST0002", "Ev0TEST0003"]) await coordinator.enqueue(request(eventId), NOW);
		expect(meter.usage(NOW).pending).toBe(3);

		await expect(coordinator.cancel(NOW)).resolves.toEqual({ cancelled: true, turnId: 1, dropped: 2 });
		expect(coordinator.isCancelled(1)).toBe(true);
		expect(coordinator.status()).toMatchObject({ running: 1, queued: 0 });
		expect(meter.usage(NOW).pending).toBe(1);

		// The running turn stops at its next step and reports back.
		await coordinator.finishTurn(1, { status: "cancelled" }, NOW);
		expect(coordinator.isCancelled(1)).toBe(false);
		expect(meter.usage(NOW).pending).toBe(0);
		await expect(coordinator.cancel(NOW)).resolves.toEqual({ cancelled: false, turnId: null, dropped: 0 });
	});

	it("a turn that fails gives its place back; one that answers leaves it to the meter's count", async () => {
		const meter = admitInMeter("Ev0TEST0001");
		admitInMeter("Ev0TEST0002");
		await coordinator.enqueue(request("Ev0TEST0001"), NOW);
		await coordinator.enqueue(request("Ev0TEST0002"), NOW);
		await coordinator.finishTurn(1, { status: "failed" }, NOW);
		expect(meter.usage(NOW).pending).toBe(1);
		// A done turn already called recordAnswer, which moved its pending answer to the count.
		await coordinator.finishTurn(2, { status: "done" }, NOW);
		expect(meter.usage(NOW).pending).toBe(1);
	});

	it("starts the next turn at once when a runner finishes immediately or fails to start", async () => {
		runner.next = { finished: { status: "done" } };
		await expect(coordinator.enqueue(request("Ev0TEST0001"), NOW)).resolves.toEqual({ status: "started", turnId: 1, position: 0 });
		expect(coordinator.status()).toMatchObject({ running: null, queued: 0 });
		coordinator.runner = { start: async () => { throw new Error("workflow_unavailable"); } };
		admitInMeter("Ev0TEST0002");
		await coordinator.enqueue(request("Ev0TEST0002"), NOW);
		expect(coordinator.status()).toMatchObject({ running: null, queued: 0 });
		expect(world.meters.get(world.meters.idFromName(INSTALLATION_ID)).usage(NOW).pending).toBe(0);
	});

	it("adds the columns turns gained since its table was created, keeping what an existing object holds", async () => {
		// An object created by the first release (before the agent run): its turns table has none of the run's columns.
		const storage = new FakeStorage();
		storage.db.exec(`CREATE TABLE turns (
			id INTEGER PRIMARY KEY AUTOINCREMENT, thread_key TEXT NOT NULL, event_id TEXT NOT NULL UNIQUE, installation_id TEXT NOT NULL,
			team_id TEXT, channel TEXT NOT NULL, thread_ts TEXT NOT NULL, message_ts TEXT NOT NULL, slack_user_id TEXT NOT NULL,
			kind TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, started_at INTEGER
		)`);
		storage.db.exec(`INSERT INTO turns (thread_key, event_id, installation_id, team_id, channel, thread_ts, message_ts, slack_user_id, kind, text, status, created_at, started_at)
			VALUES ('${KEY}', 'Ev0OLD00001', '${INSTALLATION_ID}', 'T0TEST0001', 'C0CHANNEL1', '1792600000.000100', '1792600000.000100', 'U0PERSON01', 'mention', 'an older message', 'running', ${NOW}, ${NOW})`);
		// Its working memory predates the reply timestamps.
		storage.db.exec("CREATE TABLE memory (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL)");
		storage.db.exec(`INSERT INTO memory (kind, text, at) VALUES ('reply', 'An older answer', ${NOW})`);
		const upgraded = new ThreadCoordinator(fakeState(storage), world.env);
		const columns = (table = "turns") => (storage.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name);
		expect(columns()).toEqual(expect.arrayContaining(["context", "reply_ts", "staged_reply", "staged_tools", "attempt_costs"]));
		expect(columns("memory")).toContain("ts");
		upgraded.setTurnContext(1, { root: null, messages: [{ role: "user", author: "U0PERSON02", text: "earlier", ts: "1792600000.000050" }], fromRoot: true, partial: false });
		upgraded.setReplyTs(1, "1792600100.000001");
		upgraded.stageTurnOutput(1, { attempt: 1, costNanos: 1_000, reply: "Answer", tools: [] });
		expect(upgraded.turnInput(1)).toMatchObject({ text: "an older message", replyTs: "1792600100.000001", stagedReply: "Answer", attemptCosts: { 1: 1_000 } });
		// A turn whose context was stored as a plain list of messages still reads.
		storage.db.exec(`UPDATE turns SET context = '${JSON.stringify([{ role: "user", author: "U0PERSON02", text: "earlier" }])}' WHERE id = 1`);
		expect(upgraded.turnInput(1)?.context).toEqual({ root: null, messages: [{ role: "user", author: "U0PERSON02", text: "earlier", ts: null }], fromRoot: true, partial: false });
		// Running it again changes nothing.
		new ThreadCoordinator(fakeState(storage), world.env);
		expect(columns().filter((name) => name === "attempt_costs")).toHaveLength(1);
		await expect(upgraded.finishTurn(1, { status: "done" }, NOW)).resolves.toEqual({ ok: true });
		expect(upgraded.workingMemory()).toEqual([
			{ kind: "reply", text: "An older answer", at: NOW, ts: null },
			{ kind: "reply", text: "Answer", at: NOW, ts: "1792600100.000001" },
		]);
	});

	it("keeps each attempt's cost once, however often it is staged", async () => {
		await coordinator.enqueue(request("Ev0TEST0001"), NOW);
		coordinator.stageTurnOutput(1, { attempt: 1, costNanos: 100, reply: "a", tools: [] });
		coordinator.stageTurnOutput(1, { attempt: 1, costNanos: 300, reply: "ab", tools: [] });
		coordinator.stageTurnOutput(1, { attempt: 2, costNanos: 50, reply: "b", tools: [] });
		expect(coordinator.turnInput(1)).toMatchObject({ stagedReply: "b", attemptCosts: { 1: 300, 2: 50 } });
	});

	it("starts each turn as one Workflow instance kept a day, with ids only", async () => {
		const real = world.threads.get(world.threads.idFromName(`${KEY}:workflow`));
		await expect(real.enqueue(request("Ev0TEST0001", { threadKey: `${KEY}:workflow` }), NOW)).resolves.toMatchObject({ status: "started" });
		expect(world.turns.created).toEqual([{
			id: "turn-Ev0TEST0001",
			params: {
				turnId: 1, threadKey: `${KEY}:workflow`, eventId: "Ev0TEST0001", installationId: INSTALLATION_ID, teamId: "T0TEST0001",
				channel: "C0CHANNEL1", threadTs: "1792600000.000100", messageTs: "1792600000.000100", slackUserId: "U0PERSON01", kind: "mention",
			},
			retention: { successRetention: "1 day", errorRetention: "1 day" },
		}]);
		expect(JSON.stringify(world.turns.created)).not.toContain("message for");
		// The turn runs until the instance reports back.
		expect(real.status()).toMatchObject({ running: 1, queued: 0 });
		// Starting the same turn again is a no-op.
		await expect(createWorkflowTurnRunner(world.env).start({ ...(world.turns.created[0].params as TurnRef) })).resolves.toEqual({ started: true });
		expect(world.turns.created).toHaveLength(1);
	});

	it("fails a turn that never reports back after 20 minutes, and starts the next", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		await coordinator.enqueue(request("Ev0TEST0001"), NOW);
		await coordinator.enqueue(request("Ev0TEST0002"), NOW);
		const storage = storageOf(coordinator);
		expect(storage.alarm).toBe(NOW + TURN_TIMEOUT_MS);
		vi.setSystemTime(NOW + TURN_TIMEOUT_MS);
		await coordinator.alarm();
		expect(coordinator.status()).toMatchObject({ running: 2, queued: 0 });
		expect(runner.starts.map((turn) => turn.eventId)).toEqual(["Ev0TEST0001", "Ev0TEST0002"]);
	});

	it("deletes everything 7 days after the last activity", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		runner.next = { finished: { status: "done", reply: "An answer with Slack text" } };
		await coordinator.claimEvent("Ev0TEST0001", NOW);
		await coordinator.enqueue(request("Ev0TEST0001"), NOW);
		const storage = storageOf(coordinator);
		expect(storage.alarm).toBe(NOW + 7 * DAY);

		// Activity on day 3 moves the deletion.
		await coordinator.claimEvent("Ev0TEST0002", NOW + 3 * DAY);
		vi.setSystemTime(NOW + 7 * DAY);
		await coordinator.alarm();
		expect(coordinator.workingMemory()).toHaveLength(1);
		expect(storage.alarm).toBe(NOW + 10 * DAY);

		vi.setSystemTime(NOW + 10 * DAY);
		await coordinator.alarm();
		expect(storage.alarm).toBeNull();
		for (const table of ["events", "turns", "memory", "meta", "known_messages", "link_offers"]) expect(storage.count(table)).toBe(0);
		// A new message after that starts from nothing.
		await expect(coordinator.claimEvent("Ev0TEST0001", NOW + 11 * DAY)).resolves.toBe(true);
	});
});
