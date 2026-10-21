import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextPeriodStart, periodStart, tierFor, type MeterSettings, type UserFacts, type WorkspaceMeter } from "../src/meter";
import { INSTALLATION_ID, storageOf, testWorld, WORKSPACE_ID, type TestWorld } from "./fakes";

const PERSON: UserFacts = { isBot: false, isExternal: false, isGuest: false };
const OCT_21 = Date.UTC(2026, 9, 21, 12, 0, 0);

function settings(overrides: Partial<MeterSettings> = {}): MeterSettings {
	return {
		id: INSTALLATION_ID,
		workspace_id: WORKSPACE_ID,
		status: "active",
		plan_people: 3,
		over_plan: "refuse",
		max_people: null,
		monthly_cap_nanos: 10_000_000_000,
		answers_per_person_hour: 60,
		allow_guests: true,
		allow_external_users: false,
		...overrides,
	};
}

let world: TestWorld;
let meter: WorkspaceMeter;
let eventCounter = 0;

function admit(slackUserId: string, options: { settings?: Partial<MeterSettings>; facts?: Partial<UserFacts>; now?: number; eventId?: string } = {}) {
	const eventId = options.eventId ?? `Ev${String((eventCounter += 1)).padStart(6, "0")}`;
	return { eventId, result: meter.admit({ settings: settings(options.settings), slackUserId, facts: { ...PERSON, ...options.facts }, eventId, now: options.now ?? OCT_21 }) };
}

async function answer(slackUserId: string, options: { settings?: Partial<MeterSettings>; now?: number } = {}) {
	const admitted = admit(slackUserId, options);
	if (!admitted.result.allowed) throw new Error(`refused: ${admitted.result.reason}`);
	await meter.recordAnswer({ eventId: admitted.eventId, slackUserId, now: options.now ?? OCT_21 });
	return admitted.eventId;
}

beforeEach(() => {
	world = testWorld({ now: OCT_21 });
	meter = world.meters.get(world.meters.idFromName(INSTALLATION_ID));
	eventCounter = 0;
});

afterEach(() => {
	vi.useRealTimers();
});

describe("WorkspaceMeter: who counts", () => {
	it("admits a person, holds their place, and counts the answer once it is given", async () => {
		const { eventId, result } = admit("U0PERSON01");
		expect(result).toEqual({ allowed: true, newPerson: true, people: 1, tier: { people: 3, priceNanos: 990_000_000 } });
		expect(meter.usage(OCT_21)).toEqual({ period: "2026-10-01", people: 1, answers: 0, pending: 1 });
		await expect(meter.recordAnswer({ eventId, slackUserId: "U0PERSON01", now: OCT_21 })).resolves.toEqual({ counted: true });
		await expect(meter.recordAnswer({ eventId, slackUserId: "U0PERSON01", now: OCT_21 })).resolves.toEqual({ counted: false });
		expect(meter.usage(OCT_21)).toEqual({ period: "2026-10-01", people: 1, answers: 1, pending: 0 });
		expect(admit("U0PERSON01").result).toMatchObject({ allowed: true, newPerson: false, people: 1 });
	});

	it("never counts bots and never tells admins about them", () => {
		expect(admit("U0BOTUSER1", { facts: { isBot: true } }).result).toMatchObject({ allowed: false, reason: "bot", auditForAdmins: false });
		expect(meter.usage(OCT_21)).toMatchObject({ people: 0, pending: 0 });
	});

	it("refuses people from other organisations unless allowed, and then counts them", () => {
		expect(admit("U0OUTSIDE1", { facts: { isExternal: true } }).result).toMatchObject({ allowed: false, reason: "external_user", auditForAdmins: true });
		// Admins hear once a month per person.
		expect(admit("U0OUTSIDE1", { facts: { isExternal: true } }).result).toMatchObject({ allowed: false, reason: "external_user", auditForAdmins: false });
		expect(admit("U0OUTSIDE2", { facts: { isExternal: true } }).result).toMatchObject({ auditForAdmins: true });
		expect(meter.usage(OCT_21).people).toBe(0);
		expect(admit("U0OUTSIDE1", { facts: { isExternal: true }, settings: { allow_external_users: true } }).result).toMatchObject({ allowed: true, newPerson: true, people: 1 });
	});

	it("allows guests unless an admin turns them off", () => {
		expect(admit("U0GUEST001", { facts: { isGuest: true } }).result).toMatchObject({ allowed: true });
		expect(admit("U0GUEST002", { facts: { isGuest: true }, settings: { allow_guests: false } }).result).toMatchObject({ allowed: false, reason: "guest", auditForAdmins: true });
	});

	it("refuses while the installation is paused or a payment is due", () => {
		expect(admit("U0PERSON01", { settings: { status: "paused" } }).result).toMatchObject({ allowed: false, reason: "paused", auditForAdmins: false });
		expect(admit("U0PERSON01", { settings: { status: "payment_due" } }).result).toMatchObject({ allowed: false, reason: "payment_due", auditForAdmins: false });
		expect(meter.usage(OCT_21).people).toBe(0);
	});

	it("holds one place when the same event is admitted twice", () => {
		admit("U0PERSON01", { eventId: "Ev0SAME0001" });
		expect(admit("U0PERSON01", { eventId: "Ev0SAME0001" }).result).toMatchObject({ allowed: true, newPerson: false });
		expect(meter.usage(OCT_21)).toMatchObject({ people: 1, pending: 1 });
	});
});

describe("WorkspaceMeter: limits", () => {
	it("refuses a new person beyond the plan by default, telling admins once a month", () => {
		for (const user of ["U0PERSON01", "U0PERSON02", "U0PERSON03"]) expect(admit(user).result.allowed).toBe(true);
		expect(admit("U0PERSON04").result).toEqual({ allowed: false, reason: "plan_full", people: 3, tier: { people: 3, priceNanos: 990_000_000 }, auditForAdmins: true });
		expect(admit("U0PERSON05").result).toMatchObject({ allowed: false, reason: "plan_full", auditForAdmins: false });
		// People already counted this month keep getting answers.
		expect(admit("U0PERSON01").result).toMatchObject({ allowed: true, newPerson: false });
	});

	it("moves up a tier when the admin chose move_up", () => {
		for (const user of ["U0PERSON01", "U0PERSON02", "U0PERSON03"]) admit(user, { settings: { over_plan: "move_up" } });
		expect(admit("U0PERSON04", { settings: { over_plan: "move_up" } }).result).toEqual({ allowed: true, newPerson: true, people: 4, tier: { people: 10, priceNanos: 2_990_000_000 } });
	});

	it("never goes past max_people, even when moving up", () => {
		const limits = { over_plan: "move_up" as const, max_people: 4, plan_people: 3 };
		for (const user of ["U0PERSON01", "U0PERSON02", "U0PERSON03", "U0PERSON04"]) expect(admit(user, { settings: limits }).result.allowed).toBe(true);
		expect(admit("U0PERSON05", { settings: limits }).result).toMatchObject({ allowed: false, reason: "max_people", people: 4, auditForAdmins: true });
	});

	it("refuses a new person when moving up would take the month over the spending cap", () => {
		const capped = { over_plan: "move_up" as const, monthly_cap_nanos: 990_000_000 };
		for (const user of ["U0PERSON01", "U0PERSON02", "U0PERSON03"]) expect(admit(user, { settings: capped }).result.allowed).toBe(true);
		// A fourth person moves the plan to $2.99.
		expect(admit("U0PERSON04", { settings: capped }).result).toMatchObject({ allowed: false, reason: "monthly_cap", auditForAdmins: true });
	});

	it("refuses an answer beyond the included ones when it would pass the cap, counting answers in progress", async () => {
		const capped = { monthly_cap_nanos: 990_000_000, answers_per_person_hour: 10_000 };
		// One person: $0.99 a month with 300 answers included. Extra answers are $0.25 per 1,000.
		for (let index = 0; index < 299; index += 1) await answer("U0PERSON01", { settings: capped });
		const pending = admit("U0PERSON01", { settings: capped });
		expect(pending.result.allowed).toBe(true);
		// The 301st answer would cost $0.00025 more than the cap; the one in progress counts.
		expect(admit("U0PERSON01", { settings: capped }).result).toMatchObject({ allowed: false, reason: "monthly_cap" });
		meter.release({ eventId: pending.eventId });
		expect(admit("U0PERSON01", { settings: capped }).result.allowed).toBe(true);
		// A cap $0.00025 higher allows exactly one extra answer.
		const higher = { ...capped, monthly_cap_nanos: 990_250_000 };
		expect(admit("U0PERSON01", { settings: higher }).result.allowed).toBe(true);
		expect(admit("U0PERSON01", { settings: higher }).result).toMatchObject({ allowed: false, reason: "monthly_cap" });
	});

	it("limits answers per person per hour", () => {
		const limited = { answers_per_person_hour: 2 };
		expect(admit("U0PERSON01", { settings: limited }).result.allowed).toBe(true);
		expect(admit("U0PERSON01", { settings: limited, now: OCT_21 + 60_000 }).result.allowed).toBe(true);
		expect(admit("U0PERSON01", { settings: limited, now: OCT_21 + 120_000 }).result).toMatchObject({ allowed: false, reason: "hourly_limit", auditForAdmins: true });
		// Someone else has their own allowance; the next hour starts again.
		expect(admit("U0PERSON02", { settings: limited, now: OCT_21 + 120_000 }).result.allowed).toBe(true);
		expect(admit("U0PERSON01", { settings: limited, now: OCT_21 + 60 * 60_000 }).result.allowed).toBe(true);
	});

	it("stops counting an answer in progress after 30 minutes, or when it is released", () => {
		const first = admit("U0PERSON01");
		admit("U0PERSON02");
		expect(meter.usage(OCT_21).pending).toBe(2);
		meter.release({ eventId: first.eventId });
		expect(meter.usage(OCT_21).pending).toBe(1);
		expect(meter.usage(OCT_21 + 30 * 60_000).pending).toBe(0);
	});

	it("prices tiers from the shared pricing module", () => {
		expect(tierFor(0)).toEqual({ people: 3, priceNanos: 990_000_000 });
		expect(tierFor(11)).toEqual({ people: 25, priceNanos: 4_990_000_000 });
		expect(tierFor(100)).toEqual({ people: 100, priceNanos: 14_990_000_000 });
		expect(tierFor(1_000)).toEqual({ people: 1_000, priceNanos: 59_000_000_000 });
	});
});

describe("WorkspaceMeter: flushing to Postgres", () => {
	it("sends running totals of people with answers, at most about once a minute", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(OCT_21);
		const storage = storageOf(meter);
		admit("U0NOANSWER");
		await answer("U0PERSON01");
		expect(storage.alarm).toBe(OCT_21 + 10_000);

		vi.setSystemTime(OCT_21 + 10_000);
		await meter.alarm();
		expect(world.db.flushes).toEqual([
			{ installationId: INSTALLATION_ID, period: "2026-10-01", people: [{ slack_user_id: "U0PERSON01", first_answer_at: new Date(OCT_21).toISOString(), answers: 1 }] },
		]);
		// Nothing left to send: the next alarm closes the month.
		expect(storage.alarm).toBe(nextPeriodStart(OCT_21) + 60_000);

		await answer("U0PERSON01", { now: OCT_21 + 20_000 });
		await answer("U0PERSON01", { now: OCT_21 + 25_000 });
		// A minute after the last flush, not sooner.
		expect(storage.alarm).toBe(OCT_21 + 70_000);
		vi.setSystemTime(OCT_21 + 70_000);
		await meter.alarm();
		// Running totals, not the two new answers: a repeated flush can only confirm a count.
		expect(world.db.flushes[1].people).toEqual([{ slack_user_id: "U0PERSON01", first_answer_at: new Date(OCT_21).toISOString(), answers: 3 }]);
		vi.setSystemTime(OCT_21 + 200_000);
		await meter.flush(OCT_21 + 200_000);
		expect(world.db.flushes).toHaveLength(2);
	});

	it("sends at most 1,000 people per call", async () => {
		const many = { over_plan: "move_up" as const, monthly_cap_nanos: 1_000_000_000_000 };
		for (let index = 0; index < 2_500; index += 1) await answer(`U${String(index).padStart(6, "0")}`, { settings: many });
		await expect(meter.flush(OCT_21 + 60_000)).resolves.toBe(false);
		expect(world.db.flushes.map((flush) => flush.people.length)).toEqual([1_000, 1_000, 500]);
		expect(new Set(world.db.flushes.flatMap((flush) => flush.people.map((person) => person.slack_user_id))).size).toBe(2_500);
	});

	it("keeps answers given while a flush is out for the next one", async () => {
		await answer("U0PERSON01");
		meter.recordPeople = async (installationId, period, people) => {
			world.db.flushes.push({ installationId, period, people });
			if (world.db.flushes.length === 1) await answer("U0PERSON01", { now: OCT_21 + 1_000 });
		};
		await expect(meter.flush(OCT_21 + 60_000)).resolves.toBe(true);
		await expect(meter.flush(OCT_21 + 120_000)).resolves.toBe(false);
		expect(world.db.flushes.map((flush) => flush.people[0].answers)).toEqual([1, 2]);
	});

	it("tries again a minute later when Postgres is unavailable", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(OCT_21 + 60_000);
		await answer("U0PERSON01");
		meter.recordPeople = async () => {
			throw new Error("db_error_503");
		};
		await meter.alarm();
		expect(storageOf(meter).alarm).toBe(OCT_21 + 120_000);
		meter.recordPeople = async (installationId, period, people) => {
			world.db.flushes.push({ installationId, period, people });
		};
		vi.setSystemTime(OCT_21 + 120_000);
		await meter.alarm();
		expect(world.db.flushes).toHaveLength(1);
	});
});

describe("WorkspaceMeter: months", () => {
	it("starts each UTC month empty, and flushes then deletes the last one", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		const storage = storageOf(meter);
		const lastMinuteOfOctober = Date.UTC(2026, 9, 31, 23, 59, 30);
		const november = Date.UTC(2026, 10, 1, 0, 0, 30);
		expect(periodStart(lastMinuteOfOctober)).toBe("2026-10-01");
		expect(periodStart(november)).toBe("2026-11-01");

		for (const user of ["U0PERSON01", "U0PERSON02", "U0PERSON03"]) await answer(user, { now: lastMinuteOfOctober });
		expect(admit("U0PERSON04", { now: lastMinuteOfOctober }).result).toMatchObject({ allowed: false, reason: "plan_full" });

		// November: nobody has used the agent yet, so a new person fits the plan.
		expect(admit("U0PERSON04", { now: november }).result).toMatchObject({ allowed: true, newPerson: true, people: 1 });
		expect(meter.usage(november)).toMatchObject({ period: "2026-11-01", people: 1, answers: 0 });

		vi.setSystemTime(november + 1_000);
		await meter.alarm();
		expect(world.db.flushes).toEqual([{
			installationId: INSTALLATION_ID,
			period: "2026-10-01",
			people: ["U0PERSON01", "U0PERSON02", "U0PERSON03"].map((user) => ({ slack_user_id: user, first_answer_at: new Date(lastMinuteOfOctober).toISOString(), answers: 1 })),
		}]);
		// October is gone; November stays.
		expect(storage.db.prepare("SELECT DISTINCT period FROM people").all().map((row) => row.period)).toEqual(["2026-11-01"]);
		expect(storage.db.prepare("SELECT period FROM months").all().map((row) => row.period)).toEqual(["2026-11-01"]);
		expect(storage.alarm).toBe(Date.UTC(2026, 11, 1) + 60_000);
	});

	it("counts an answer admitted just before midnight in October, so it never slips past November's limits", async () => {
		const lastMinuteOfOctober = Date.UTC(2026, 9, 31, 23, 59, 30);
		const november = Date.UTC(2026, 10, 1, 0, 0, 10);
		const limits = { plan_people: 1, max_people: 1 };
		const late = admit("U0PERSON01", { settings: limits, now: lastMinuteOfOctober });
		expect(late.result.allowed).toBe(true);
		// November's one place goes to someone else while October's answer is still being written.
		expect(admit("U0PERSON02", { settings: limits, now: november }).result).toMatchObject({ allowed: true, newPerson: true, people: 1 });
		await expect(meter.recordAnswer({ eventId: late.eventId, slackUserId: "U0PERSON01", now: november + 5_000 })).resolves.toEqual({ counted: true });
		expect(meter.usage(november + 6_000)).toMatchObject({ period: "2026-11-01", people: 1, answers: 0 });
		expect(meter.usage(lastMinuteOfOctober)).toMatchObject({ period: "2026-10-01", people: 1, answers: 1 });
		// U0PERSON01 still has no November place, so a new November turn is refused.
		expect(admit("U0PERSON01", { settings: limits, now: november + 7_000 }).result).toMatchObject({ allowed: false, reason: "max_people" });
	});

	it("keeps last month open while one of its answers is in progress, then closes it", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		const storage = storageOf(meter);
		const october = Date.UTC(2026, 9, 31, 23, 59, 0);
		const november = Date.UTC(2026, 10, 1, 0, 0, 30);
		await answer("U0PERSON01", { now: october });
		const late = admit("U0PERSON02", { now: october + 30_000 });

		vi.setSystemTime(november);
		await meter.alarm();
		expect(world.db.flushes.map((flush) => [flush.period, flush.people.map((person) => person.slack_user_id)])).toEqual([["2026-10-01", ["U0PERSON01"]]]);
		// October can't close yet: U0PERSON02's answer is still being written.
		expect(storage.db.prepare("SELECT period FROM months").all().map((row) => row.period)).toEqual(["2026-10-01"]);
		expect(storage.alarm).toBe(november + 60_000);

		await meter.recordAnswer({ eventId: late.eventId, slackUserId: "U0PERSON02", now: november + 10_000 });
		vi.setSystemTime(november + 60_000);
		await meter.alarm();
		expect(world.db.flushes.at(-1)).toMatchObject({ period: "2026-10-01", people: [{ slack_user_id: "U0PERSON02", answers: 1 }] });
		expect(storage.db.prepare("SELECT period FROM months").all()).toEqual([]);
	});

	it("never adds a person to a month whose limits they didn't pass", async () => {
		const october = Date.UTC(2026, 9, 31, 23, 40, 0);
		const late = admit("U0PERSON01", { now: october });
		// The turn timed out and gave its place back; October then closed with nothing to send.
		meter.release({ eventId: late.eventId });
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(Date.UTC(2026, 10, 1, 0, 1, 0));
		await meter.alarm();
		await expect(meter.recordAnswer({ eventId: late.eventId, slackUserId: "U0PERSON01", now: Date.UTC(2026, 10, 1, 0, 2, 0) })).resolves.toEqual({ counted: false });
		expect(meter.usage(Date.UTC(2026, 10, 1, 0, 3, 0))).toMatchObject({ period: "2026-11-01", people: 0, answers: 0 });
		// A released place in the same month still counts where the person holds it.
		const again = admit("U0PERSON01", { now: Date.UTC(2026, 10, 2) });
		meter.release({ eventId: again.eventId });
		await expect(meter.recordAnswer({ eventId: again.eventId, slackUserId: "U0PERSON01", now: Date.UTC(2026, 10, 2, 0, 25) })).resolves.toEqual({ counted: true });
		expect(meter.usage(Date.UTC(2026, 10, 2, 1))).toMatchObject({ people: 1, answers: 1 });
	});
});

describe("WorkspaceMeter: uninstalled in Slack", () => {
	it("admits nobody, drops answers in progress, and still sends what was answered", async () => {
		await answer("U0PERSON01");
		admit("U0PERSON02");
		meter.uninstalled(OCT_21 + 1_000);
		expect(meter.usage(OCT_21 + 2_000)).toMatchObject({ people: 2, answers: 1, pending: 0 });
		expect(admit("U0PERSON01", { now: OCT_21 + 3_000 }).result).toMatchObject({ allowed: false, reason: "uninstalled", auditForAdmins: false });
		await meter.flush(OCT_21 + 60_000);
		expect(world.db.flushes).toEqual([{ installationId: INSTALLATION_ID, period: "2026-10-01", people: [expect.objectContaining({ slack_user_id: "U0PERSON01", answers: 1 })] }]);
	});
});
