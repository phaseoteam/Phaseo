import { renderToStaticMarkup } from "react-dom/server";
import { AppIntlProvider } from "@/i18n/react";
import settingsMessages from "../../../../../messages/en-GB/settings-ui.json";
import commonMessages from "../../../../../messages/en-GB/common.json";
import { SchedulesList, SlackSchedulesSection } from "./SlackSchedulesSection";
import {
	lastRunState,
	pauseReasonKey,
	scheduleSettingsDraft,
	scheduleSettingsPatch,
	scheduleWhere,
	skipReasonKey,
	slackScheduleError,
	type SlackAgentSchedule,
	type SlackAgentSchedules,
} from "./slackAgentSchedules";

jest.mock("@/app/(dashboard)/settings/slack/actions", () => ({
	updateSlackAgent: jest.fn(),
	loadSlackAgentSchedules: jest.fn(),
	setSlackAgentScheduleStatus: jest.fn(),
	deleteSlackAgentSchedule: jest.fn(),
}));
jest.mock("../PrivateSettingsQuery", () => ({
	useSettingsWrite: () => (operation: Promise<unknown>) => operation,
}));
jest.mock("@/i18n/navigation", () => ({
	Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

const NOW = Date.parse("2026-10-27T09:10:00Z");

function schedule(overrides: Partial<SlackAgentSchedule>): SlackAgentSchedule {
	return {
		id: "00000000-0000-4000-8000-0000000000e1", channel_id: "C0CHANNEL1", title: "Weekly spend", prompt: "Summarise last week's Phaseo spend by model.",
		frequency: "weekly", hour: 9, minute: 0, day_of_week: 1, day_of_month: null, timezone: "Europe/London", created_by: "U0PERSON01",
		status: "active", pause_reason: null, next_run_at: "2026-11-02T09:00:00+00:00", last_run_at: "2026-10-26T09:00:00+00:00",
		last_result: "answered", last_result_reason: null, failures: 0, created_at: "2026-10-20T09:00:00Z", ...overrides,
	};
}

const DATA: SlackAgentSchedules = {
	schedules: [
		schedule({ id: "s1" }),
		schedule({ id: "s2", title: "Morning news", frequency: "weekdays", hour: 8, minute: 30, day_of_week: null, channel_id: "D0DIRECT01", timezone: "America/New_York", last_result: null, last_run_at: "2026-10-27T09:00:00Z" }),
		schedule({ id: "s3", title: "Hourly status", frequency: "hourly", hour: null, minute: 15, day_of_week: null, status: "paused", pause_reason: "failures", last_result: "failed", failures: 3 }),
		schedule({ id: "s4", title: "Month end", frequency: "monthly", day_of_week: null, day_of_month: 31, last_result: null, last_run_at: null }),
	],
	total: 4,
	limit: 20,
	enabled: true,
	creators: "everyone",
};

function render(children: React.ReactNode) {
	return renderToStaticMarkup(
		<AppIntlProvider locale="en-GB" timeZone="UTC" messages={{ SettingsUI: settingsMessages, Common: commonMessages }}>
			{children}
		</AppIntlProvider>,
	);
}

describe("SlackSchedulesSection", () => {
	it("starts closed with the admins' settings shown and nothing loaded", () => {
		const html = render(<SlackSchedulesSection settings={{ schedules_enabled: true, schedules_max: 20, schedule_creators: "everyone" }} />);
		expect(html).toContain(">Recurring tasks<");
		expect(html).toContain("hourly at the most");
		expect(html).toContain("Let people set up recurring tasks");
		expect(html).toMatch(/role="switch"[^>]*aria-checked="true"/);
		expect(html).toContain('value="20"');
		expect(html).toContain("From 1 to 100. Lowering it keeps the ones already set up.");
		expect(html).toContain("Everyone who can use the agent");
		expect(html).toContain("Only people who connected their Phaseo account");
		expect(html).not.toContain("<table");
		expect(html).not.toContain("Loading");
		expect(html).not.toMatch(/rounded-(full|lg|xl)\b/);
		expect(render(<SlackSchedulesSection settings={{ schedules_enabled: false }} />)).toMatch(/role="switch"[^>]*aria-checked="false"/);
	});

	it("lists what each does, where, how often, its next run, who set it up and its last run", () => {
		const html = render(<SchedulesList data={DATA} onChanged={() => undefined} now={NOW} />);
		expect(html).toContain("4 of 20 set up");
		expect(html).toContain(">Weekly spend<");
		expect(html).toContain("Summarise last week&#x27;s Phaseo spend by model.");
		expect(html).toContain("Channel C0CHANNEL1");
		expect(html).toContain("Direct message D0DIRECT01");
		expect(html).toContain("Every Monday at 09:00");
		expect(html).toContain("Weekdays at 08:30");
		expect(html).toContain("Every hour at :15");
		expect(html).toContain("Monthly on day 31 at 09:00");
		expect(html).toContain("Europe/London time");
		expect(html).toContain("America/New_York time");
		// The next run in the schedule's own time zone.
		expect(html).toContain("2 Nov 2026, 09:00");
		expect(html).toContain(">Paused<");
		expect(html).toContain("3 runs in a row didn&#x27;t go through");
		expect(html).toContain(">Answered<");
		expect(html).toContain(">Running<");
		expect(html).toContain(">Failed<");
		expect(html).toContain(">Not run yet<");
		expect(html).toContain("Failures in a row: 3");
		expect(html).toContain("U0PERSON01");
		expect(html.match(/>Pause</g)).toHaveLength(3);
		expect(html.match(/>Resume</g)).toHaveLength(1);
		expect(html.match(/>Delete</g)).toHaveLength(4);
		expect(html).not.toMatch(/rounded-(full|lg|xl)\b/);
	});

	it("says why a run was skipped: the agent was paused, a bill unpaid, recurring tasks off or a limit", () => {
		const skipped = (id: string, reason: string | null) => schedule({ id, last_result: "skipped", last_result_reason: reason });
		const html = render(<SchedulesList data={{ ...DATA, schedules: [
			skipped("k1", "installation_paused"), skipped("k2", "payment_due"), skipped("k3", "schedules_off"), skipped("k4", "monthly_cap"), skipped("k5", "creator_access"),
		], total: 5 }} onChanged={() => undefined} now={NOW} />);
		expect(html).toContain(">Skipped: the agent was paused<");
		expect(html).toContain(">Skipped: a Phaseo bill was unpaid<");
		expect(html).toContain(">Skipped: recurring tasks were off<");
		expect(html).toContain(">Skipped: a usage limit was reached<");
		// A reason without its own words is just Skipped (its pause reason says why).
		expect(html).toContain(">Skipped<");
		expect(html).not.toMatch(/text-destructive">Skipped/);
	});

	it("says when there are none, and when they are turned off", () => {
		expect(render(<SchedulesList data={{ ...DATA, schedules: [], total: 0 }} onChanged={() => undefined} />)).toContain("No recurring tasks yet.");
		expect(render(<SchedulesList data={{ ...DATA, enabled: false }} onChanged={() => undefined} />)).toContain("Recurring tasks are turned off, so none of these run");
	});
});

describe("slackAgentSchedules", () => {
	it("sends only the settings that changed, and refuses a maximum outside 1 to 100", () => {
		const saved = scheduleSettingsDraft({ schedules_enabled: true, schedules_max: 20, schedule_creators: "everyone" });
		expect(saved).toEqual({ enabled: true, max: "20", creators: "everyone" });
		expect(scheduleSettingsDraft({})).toEqual({ enabled: true, max: "20", creators: "everyone" });
		expect(scheduleSettingsPatch({ ...saved, max: " 5 " }, saved)).toEqual({ ok: true, value: { schedules_max: 5 } });
		expect(scheduleSettingsPatch({ enabled: false, max: "20", creators: "linked" }, saved)).toEqual({ ok: true, value: { schedules_enabled: false, schedule_creators: "linked" } });
		expect(scheduleSettingsPatch(saved, saved)).toEqual({ ok: true, value: {} });
		for (const max of ["0", "101", "2.5", "", "ten"]) expect(scheduleSettingsPatch({ ...saved, max }, saved)).toEqual({ ok: false, problem: "max" });
	});

	it("tells a channel from a direct message, maps pause reasons, and knows a run that hasn't reported back", () => {
		expect(scheduleWhere("C0CHANNEL1")).toBe("channel");
		expect(scheduleWhere("G0PRIVATE1")).toBe("channel");
		expect(scheduleWhere("D0DIRECT01")).toBe("directMessage");
		expect(pauseReasonKey("not_in_channel")).toBe("notInChannel");
		expect(pauseReasonKey("creator_access")).toBe("creatorAccess");
		expect(skipReasonKey("installation_paused")).toBe("installationPaused");
		expect(skipReasonKey("payment_due")).toBe("paymentDue");
		expect(skipReasonKey("schedules_off")).toBe("schedulesOff");
		for (const reason of ["max_people", "plan_full", "hourly_limit", "monthly_cap"]) expect(skipReasonKey(reason)).toBe("limit");
		expect(skipReasonKey("creator_access")).toBeNull();
		expect(skipReasonKey(null)).toBeNull();
		expect(pauseReasonKey("something_new")).toBe("admin");
		expect(lastRunState({ last_result: "skipped", last_run_at: "2026-10-27T09:00:00Z" }, NOW)).toBe("skipped");
		expect(lastRunState({ last_result: null, last_run_at: "2026-10-27T09:00:00Z" }, NOW)).toBe("running");
		expect(lastRunState({ last_result: null, last_run_at: "2026-10-27T08:00:00Z" }, NOW)).toBe("none");
		expect(lastRunState({ last_result: null, last_run_at: null }, NOW)).toBe("none");
	});

	it("maps the schedule routes' own errors, and the rest like the other Slack settings", () => {
		expect(slackScheduleError("schedule_not_found", 404)).toEqual({ scope: "schedules", key: "scheduleNotFound" });
		expect(slackScheduleError("not_installed", 404)).toEqual({ scope: "slack", key: "notInstalled", message: undefined });
		expect(slackScheduleError("bad_request", 400, "status must be active or paused")).toEqual({ scope: "slack", key: "invalid", message: "status must be active or paused" });
	});
});
