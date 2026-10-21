import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TURN_TIMEOUT_MS, type ThreadCoordinator, type TurnRequest } from "../src/coordinator";
import { createWorkflowTurnRunner, type TurnRef, type TurnRunner, type TurnStart } from "../src/turns";
import { INSTALLATION_ID, storageOf, testWorld, WORKSPACE_ID, type TestWorld } from "./fakes";

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
		expect(coordinator.turnInput(1)).toEqual({ text: "message for Ev0TEST0001", context: null, replyTs: null, stagedReply: null, stagedTools: [], memory: [] });
		await coordinator.finishTurn(1, { status: "done", reply: "Answer" }, NOW);
		expect(coordinator.turnInput(1)).toBeNull();
		const storage = storageOf(coordinator);
		expect(storage.db.prepare("SELECT count(*) AS count FROM turns").all()[0]).toEqual({ count: 0 });
	});

	it("keeps the bot's replies and short tool summaries as working memory", async () => {
		await coordinator.enqueue(request("Ev0TEST0001"), NOW);
		await coordinator.finishTurn(1, { status: "done", reply: "  Spend was $12.50.  ", tools: ["get_spend: 5 weeks by week", "", "x".repeat(500)] }, NOW);
		expect(coordinator.workingMemory()).toEqual([
			{ kind: "tool", text: "get_spend: 5 weeks by week", at: NOW },
			{ kind: "tool", text: "x".repeat(200), at: NOW },
			{ kind: "reply", text: "Spend was $12.50.", at: NOW },
		]);
		for (let index = 2; index <= 25; index += 1) {
			await coordinator.enqueue(request(`Ev0TEST${String(index).padStart(4, "0")}`), NOW);
			await coordinator.finishTurn(index, { status: "done", reply: `reply ${index}` }, NOW);
		}
		const memory = coordinator.workingMemory();
		expect(memory).toHaveLength(20);
		expect(memory.at(-1)).toEqual({ kind: "reply", text: "reply 25", at: NOW });
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
		for (const table of ["events", "turns", "memory", "meta"]) expect(storage.count(table)).toBe(0);
		// A new message after that starts from nothing.
		await expect(coordinator.claimEvent("Ev0TEST0001", NOW + 11 * DAY)).resolves.toBe(true);
	});
});
