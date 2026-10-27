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
	wake?: TurnRunner["wake"];
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
		expect(coordinator.turnInput(1)).toEqual({ text: "message for Ev0TEST0001", files: [], context: null, replyTs: null, stagedReply: null, stagedTools: [], attemptCosts: {}, postedFiles: [], memory: [] });
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
		expect(columns()).toEqual(expect.arrayContaining(["context", "reply_ts", "staged_reply", "staged_tools", "attempt_costs", "model", "external", "compare", "action_token", "searches"]));
		expect(columns("memory")).toContain("ts");
		// Its running turn hasn't searched, and can.
		expect(upgraded.searchCount(1)).toBe(0);
		expect(upgraded.reserveSearch(1, 4)).toBe(true);
		expect(upgraded.searchCount(1)).toBe(1);
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

	it("keeps a message's action token for its running turn only, never in the Workflow's payload, and drops it with the turn", async () => {
		await coordinator.enqueue(request("Ev0TEST0001", { actionToken: "1234567.890.abcdefTOKEN" }), NOW);
		await coordinator.enqueue(request("Ev0TEST0002", { messageTs: "1792600000.000300", actionToken: "1234567.890.secondTOKEN" }), NOW);
		expect(coordinator.actionToken(1)).toBe("1234567.890.abcdefTOKEN");
		// Queued, not running: not handed out yet.
		expect(coordinator.actionToken(2)).toBeNull();
		expect(JSON.stringify(runner.starts)).not.toContain("TOKEN");
		await coordinator.finishTurn(1, { status: "done", reply: "Done", tools: ["search_slack \"launch plan\": 2 results"] }, NOW);
		expect(coordinator.actionToken(1)).toBeNull();
		expect(coordinator.actionToken(2)).toBe("1234567.890.secondTOKEN");
		expect(JSON.stringify(runner.starts)).not.toContain("TOKEN");
		await coordinator.finishTurn(2, { status: "done" }, NOW);
		expect(storageOf(coordinator).db.prepare("SELECT count(*) AS count FROM turns WHERE action_token IS NOT NULL").all()).toEqual([{ count: 0 }]);
	});

	it("counts a running turn's Slack searches across its runs and retries, up to the most it may make", async () => {
		await coordinator.enqueue(request("Ev0TEST0001", { actionToken: "1234567.890.abcdefTOKEN" }), NOW);
		await coordinator.enqueue(request("Ev0TEST0002", { messageTs: "1792600000.000300" }), NOW);
		expect(coordinator.searchCount(1)).toBe(0);
		// However many runs ask (a run after a question, or a retried one), the turn makes 4 at most.
		const reserved = [1, 2, 3, 4, 5, 6].map(() => coordinator.reserveSearch(1, 4));
		expect(reserved).toEqual([true, true, true, true, false, false]);
		expect(coordinator.searchCount(1)).toBe(4);
		// A queued turn can't search yet, and hasn't.
		expect(coordinator.reserveSearch(2, 4)).toBe(false);
		expect(coordinator.searchCount(2)).toBeNull();
		await coordinator.finishTurn(1, { status: "done" }, NOW);
		// Ended: no more searches, and the count says so.
		expect(coordinator.reserveSearch(1, 4)).toBe(false);
		expect(coordinator.searchCount(1)).toBeNull();
		expect(coordinator.searchCount(2)).toBe(0);
	});

	it("keeps, per turn, whether the person is from another organisation", async () => {
		runner.next = { finished: { status: "done" } };
		admitInMeter("Ev0TEST0001");
		await coordinator.enqueue(request("Ev0TEST0001", { external: true }), NOW);
		admitInMeter("Ev0TEST0002");
		await coordinator.enqueue(request("Ev0TEST0002"), NOW);
		expect(runner.starts.map((turn) => turn.external)).toEqual([true, undefined]);
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
		for (const table of ["events", "turns", "memory", "meta", "known_messages", "link_offers", "questions"]) expect(storage.count(table)).toBe(0);
		// A new message after that starts from nothing.
		await expect(coordinator.claimEvent("Ev0TEST0001", NOW + 11 * DAY)).resolves.toBe(true);
	});

	describe("a turn's questions", () => {
		const DRAFT = { callId: "call_q1", text: "Which region?", options: ["EU", "US"], other: false };
		const button = (choice: number) => ({ by: "button" as const, choice, text: "" });

		/** A running turn whose question 1 is posted. */
		async function asking() {
			await coordinator.enqueue(request("Ev0TEST0001"), NOW);
			expect(coordinator.holdForAnswer(1, 1, { run: "{\"run\":\"paused\"}", question: DRAFT })).toBe(true);
			await coordinator.questionPosted(1, 1, "1792600100.000002", NOW);
		}

		it("keeps the paused run and question until it's posted, and never replaces a posted one", async () => {
			await expect(coordinator.enqueue(request("Ev0TEST0001"), NOW)).resolves.toMatchObject({ status: "started" });
			expect(coordinator.holdForAnswer(1, 1, { run: "{}", question: DRAFT })).toBe(true);
			// A retried run replaces its own unposted question.
			expect(coordinator.holdForAnswer(1, 1, { run: "{\"retried\":true}", question: { ...DRAFT, callId: "call_q2" } })).toBe(true);
			expect(coordinator.question(1, 1)).toMatchObject({ n: 1, callId: "call_q2", status: "pending", ts: null });
			await expect(coordinator.questionPosted(1, 1, "1792600100.000002", NOW)).resolves.toMatchObject({ status: "open", ts: "1792600100.000002", expiresAt: NOW + 60 * 60_000 });
			expect(coordinator.holdForAnswer(1, 1, { run: "{}", question: DRAFT })).toBe(false);
			expect(coordinator.pausedRun(1, 1)).toMatchObject({ run: "{\"retried\":true}" });
			// Too big to keep in one row, or for a turn that isn't running.
			expect(coordinator.holdForAnswer(1, 2, { run: "x".repeat(1_500_001), question: DRAFT })).toBe(false);
			// The limit is in UTF-8 bytes: 600,000 three-byte characters are 1.8 MB.
			expect(coordinator.holdForAnswer(1, 2, { run: "語".repeat(600_000), question: DRAFT })).toBe(false);
			expect(coordinator.holdForAnswer(9, 1, { run: "{}", question: DRAFT })).toBe(false);
		});

		it("takes the first answer from the person asked, and wakes the turn", async () => {
			const wakes: Array<[number, number]> = [];
			runner.wake = async (turn, n) => { wakes.push([turn.turnId, n]); };
			await asking();
			await expect(coordinator.answerQuestion({ turnId: 1, n: 1, slackUserId: "U0PERSON02", answer: button(0), now: NOW })).resolves.toEqual({ status: "not_asker", askerId: "U0PERSON01" });
			await expect(coordinator.answerQuestion({ turnId: 1, n: 1, slackUserId: "U0PERSON01", answer: button(7), now: NOW })).resolves.toMatchObject({ status: "closed" });
			await expect(coordinator.answerQuestion({ turnId: 1, n: 1, slackUserId: "U0PERSON01", answer: button(1), now: NOW + 1_000 })).resolves.toMatchObject({ status: "answered", turnId: 1, askerId: "U0PERSON01", question: { status: "answered", answer: { by: "button", choice: 1, text: "US" } } });
			await expect(coordinator.answerQuestion({ turnId: 1, n: 1, slackUserId: "U0PERSON01", answer: button(0), now: NOW + 2_000 })).resolves.toMatchObject({ status: "closed", question: { answer: { choice: 1 } } });
			expect(wakes).toEqual([[1, 1]]);
			// Closing after the answer keeps it.
			await expect(coordinator.closeQuestion(1, 1, { now: NOW + 3_000 })).resolves.toMatchObject({ status: "answered" });
		});

		it("takes a message from the person asked as their answer, and not one from anyone else", async () => {
			await asking();
			await expect(coordinator.answerWithMessage({ slackUserId: "U0PERSON02", text: "me?", now: NOW })).resolves.toBeNull();
			await expect(coordinator.answerWithMessage({ slackUserId: "U0PERSON01", text: "   ", now: NOW })).resolves.toBeNull();
			await expect(coordinator.answerWithMessage({ slackUserId: "U0PERSON01", text: ` EU${"!".repeat(3_000)}`, now: NOW })).resolves.toMatchObject({ question: { answer: { by: "message", choice: null, text: `EU${"!".repeat(1_998)}` } } });
			// Answered: the next message is a new one.
			await expect(coordinator.answerWithMessage({ slackUserId: "U0PERSON01", text: "and another thing", now: NOW })).resolves.toBeNull();
		});

		it("searches after an answer by message with that message's action token", async () => {
			await asking();
			expect(coordinator.actionToken(1)).toBeNull();
			// Someone else's token never replaces the turn's.
			await coordinator.answerWithMessage({ slackUserId: "U0PERSON02", text: "EU", actionToken: "1234567.890.otherTOKEN", now: NOW });
			expect(coordinator.actionToken(1)).toBeNull();
			await coordinator.answerWithMessage({ slackUserId: "U0PERSON01", text: "EU", actionToken: "1234567.890.answerTOKEN", now: NOW });
			expect(coordinator.actionToken(1)).toBe("1234567.890.answerTOKEN");
		});

		it("keeps the files shared with an answer in the thread, and takes files alone as an answer", async () => {
			await asking();
			const files = [{ id: "F0REPORT01", name: "report.pdf" }];
			await expect(coordinator.answerWithMessage({ slackUserId: "U0PERSON01", text: " ", files, now: NOW })).resolves.toMatchObject({
				question: { answer: { by: "message", choice: null, text: "(shared report.pdf)", files } },
			});
			expect(coordinator.pausedRun(1, 1)?.question.answer).toEqual({ by: "message", choice: null, text: "(shared report.pdf)", files });
		});

		it("keeps the charts and images an answer made for its later runs", async () => {
			await asking();
			coordinator.recordPostedFile(1, { kind: "chart", title: "Spend by week", shown: true });
			coordinator.recordPostedFile(1, { kind: "image", title: "A fox", shown: false });
			expect(coordinator.turnInput(1)?.postedFiles).toEqual([
				{ kind: "chart", title: "Spend by week", shown: true },
				{ kind: "image", title: "A fox", shown: false },
			]);
			// Past the chart limit, images are still kept: the answer's image limit counts them.
			for (let index = 0; index < 25; index += 1) coordinator.recordPostedFile(1, { kind: "chart", title: `Chart ${index}`, shown: true });
			coordinator.recordPostedFile(1, { kind: "image", title: "A badger", shown: true });
			const posted = coordinator.turnInput(1)!.postedFiles;
			expect(posted.filter((file) => file.kind === "chart")).toHaveLength(20);
			expect(posted.filter((file) => file.kind === "image").map((file) => file.title)).toEqual(["A fox", "A badger"]);
		});

		it("gives the files of every answered question, the latest answer's first", async () => {
			await asking();
			await coordinator.answerWithMessage({ slackUserId: "U0PERSON01", text: "this one", files: [{ id: "F0FIRST001", name: "first.pdf" }], now: NOW });
			await coordinator.closeQuestion(1, 1, { now: NOW });
			expect(coordinator.holdForAnswer(1, 2, { run: "{}", question: { ...DRAFT, callId: "call_q2" } })).toBe(true);
			await coordinator.questionPosted(1, 2, "1792600100.000003", NOW);
			await coordinator.answerWithMessage({ slackUserId: "U0PERSON01", text: "and this", files: [{ id: "F0SECOND01", name: "second.png" }], now: NOW });
			expect(coordinator.answeredFiles(1)).toEqual([{ id: "F0SECOND01", name: "second.png" }, { id: "F0FIRST001", name: "first.pdf" }]);
		});

		it("refuses answers once the hour is up, and closes as expired, or stopped when the thread was cancelled", async () => {
			await asking();
			await expect(coordinator.answerQuestion({ turnId: 1, n: 1, slackUserId: "U0PERSON01", answer: button(0), now: NOW + 60 * 60_000 })).resolves.toMatchObject({ status: "closed" });
			await expect(coordinator.closeQuestion(1, 1, { now: NOW + 60 * 60_000 })).resolves.toMatchObject({ status: "expired" });

			await coordinator.finishTurn(1, { status: "done" }, NOW);
			await coordinator.enqueue(request("Ev0TEST0002"), NOW);
			coordinator.holdForAnswer(2, 1, { run: "{}", question: DRAFT });
			await coordinator.questionPosted(2, 1, "1792600100.000003", NOW);
			await coordinator.cancel(NOW);
			await expect(coordinator.answerQuestion({ turnId: 2, n: 1, slackUserId: "U0PERSON01", answer: button(0), now: NOW })).resolves.toMatchObject({ status: "closed" });
			await expect(coordinator.closeQuestion(2, 1, { now: NOW })).resolves.toMatchObject({ status: "cancelled" });
		});

		it("wakes a waiting turn when the thread is stopped, and tells others who write that it's waiting", async () => {
			const wakes: Array<[number, number]> = [];
			runner.wake = async (turn, n) => { wakes.push([turn.turnId, n]); };
			await asking();
			// Both say when the question expires, so the meter keeps their places that long.
			await expect(coordinator.enqueue(request("Ev0TEST0002", { slackUserId: "U0PERSON02" }), NOW)).resolves.toEqual({ status: "queued", turnId: 2, position: 1, waitingFor: "U0PERSON01", waitingUntil: NOW + 60 * 60_000 });
			await expect(coordinator.enqueue(request("Ev0TEST0003"), NOW)).resolves.toEqual({ status: "queued", turnId: 3, position: 2, waitingUntil: NOW + 60 * 60_000 });
			await expect(coordinator.queuedEventIds()).resolves.toEqual(["Ev0TEST0002", "Ev0TEST0003"]);
			await coordinator.cancel(NOW);
			expect(wakes).toEqual([[1, 1]]);
			// A turn that can't be woken waits out its question instead; stopping still works.
			runner.wake = async () => { throw new Error("instance_gone"); };
			await expect(coordinator.cancel(NOW)).resolves.toMatchObject({ turnId: 1 });
		});

		it("doesn't time out a turn while its question waits, but does once it has gone 20 minutes past it", async () => {
			vi.useFakeTimers({ toFake: ["Date"] });
			await asking();
			const storage = storageOf(coordinator);
			expect(storage.alarm).toBe(NOW + 60 * 60_000 + TURN_TIMEOUT_MS);
			vi.setSystemTime(NOW + TURN_TIMEOUT_MS);
			await coordinator.alarm();
			expect(coordinator.status()).toMatchObject({ running: 1 });
			// Answered at 30 minutes: the run after it has 20 minutes from then.
			await coordinator.answerQuestion({ turnId: 1, n: 1, slackUserId: "U0PERSON01", answer: button(0), now: NOW + 30 * 60_000 });
			expect(storage.alarm).toBe(NOW + 30 * 60_000 + TURN_TIMEOUT_MS);
			vi.setSystemTime(NOW + 30 * 60_000 + TURN_TIMEOUT_MS);
			await coordinator.alarm();
			expect(coordinator.status()).toMatchObject({ running: null });
			expect(storage.count("questions")).toBe(0);
		});

		it("remembers the reply before each question, the question and what became of it, then the rest of the answer", async () => {
			await asking();
			coordinator.setReplyTs(1, "1792600100.000001");
			coordinator.stageTurnOutput(1, { attempt: 1, costNanos: 0, reply: "First part.", tools: ["get_spend 2026-10-01 to 2026-10-21 by day"] });
			coordinator.closeLegReply(1, 1);
			// Safe to repeat: the reply moved to the question once.
			coordinator.closeLegReply(1, 1);
			expect(coordinator.turnInput(1)).toMatchObject({ replyTs: null, stagedReply: null, stagedTools: [] });
			await coordinator.answerQuestion({ turnId: 1, n: 1, slackUserId: "U0PERSON01", answer: button(0), now: NOW });
			coordinator.setReplyTs(1, "1792600100.000003");
			coordinator.stageTurnOutput(1, { attempt: "1:1", costNanos: 0, reply: "Second part.", tools: [] });
			await coordinator.finishTurn(1, { status: "done" }, NOW);
			expect(coordinator.workingMemory().map((entry) => [entry.kind, entry.text, entry.ts])).toEqual([
				["tool", "get_spend 2026-10-01 to 2026-10-21 by day", null],
				["reply", "First part.", "1792600100.000001"],
				["reply", "You asked <@U0PERSON01>: Which region? (options: EU, US). <@U0PERSON01> chose: EU", "1792600100.000002"],
				["reply", "Second part.", "1792600100.000003"],
			]);
			expect(storageOf(coordinator).count("questions")).toBe(0);
		});
	});
});
