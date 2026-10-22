import {
	CUSTOM_PLAN,
	amountInput,
	buildLimits,
	callbackNotice,
	chargeMonth,
	customAppPayload,
	formatUsd,
	installDraftDefaults,
	installPayload,
	parseAmount,
	parseChannelIds,
	parseWhole,
	planPriceUsd,
	settingsDraftFrom,
	settingsPatch,
	slackErrorKey,
	slackLinkErrorKey,
	SLACK_LINK_TOKEN_PATTERN,
	type SlackAgentSettings,
} from "./slackAgentForm";

const saved: SlackAgentSettings = {
	plan_people: 25,
	over_plan: "refuse",
	max_people: null,
	monthly_cap_usd: 12.5,
	answers_per_person_hour: 60,
	model: "phaseo/auto",
	instructions: null,
	access_mode: "everyone",
	usage_data_mode: "dm",
	usage_data_channel_ids: ["C0123ABCD"],
	allow_guests: true,
	allow_external_users: false,
	token_monthly_limit_usd: 0,
};

describe("Slack agent money", () => {
	it("formats dollars in US format with cents", () => {
		expect(formatUsd(12.5)).toBe("$12.50");
		expect(formatUsd(0)).toBe("$0.00");
		expect(formatUsd(100_000)).toBe("$100,000.00");
		expect(formatUsd(0.99)).toBe("$0.99");
	});

	it("reads typed amounts strictly, never taking a comma as a decimal mark", () => {
		expect(parseAmount("25")).toBe(25);
		expect(parseAmount(" $12.50 ")).toBe(12.5);
		expect(parseAmount("1,000.50")).toBe(1000.5);
		expect(parseAmount("12,50")).toBeNull();
		expect(parseAmount("1e3")).toBeNull();
		expect(parseAmount("12.505")).toBeNull();
		expect(parseAmount("-5")).toBeNull();
		expect(parseAmount("")).toBeNull();
	});

	it("reads whole numbers with optional grouping", () => {
		expect(parseWhole("60")).toBe(60);
		expect(parseWhole("1,500")).toBe(1500);
		expect(parseWhole("1.5")).toBeNull();
		expect(parseWhole("15,00")).toBeNull();
	});

	it("shows saved amounts the way they were typed", () => {
		expect(amountInput(25)).toBe("25");
		expect(amountInput(12.5)).toBe("12.50");
	});

	it("prices plans from the shared price list", () => {
		expect(planPriceUsd(3)).toBe(0.99);
		expect(planPriceUsd(10)).toBe(2.99);
		expect(planPriceUsd(100)).toBe(14.99);
		expect(planPriceUsd(1_000)).toBe(59);
	});
});

describe("Slack agent limits", () => {
	it("needs the cap to cover the plan and the hard limit to be at least the plan", () => {
		const draft = { ...installDraftDefaults(), plan: "100", monthlyCapUsd: "10" };
		expect(buildLimits(draft)).toEqual({ ok: false, problem: { field: "monthlyCapUsd", code: "capBelowPlan", values: { price: "$14.99" } } });
		expect(buildLimits({ ...draft, monthlyCapUsd: "20", maxPeople: "50" })).toEqual({ ok: false, problem: { field: "maxPeople", code: "maxPeopleBelowPlan", values: { people: "100" } } });
		expect(buildLimits({ ...draft, monthlyCapUsd: "0" }).ok).toBe(false);
		expect(buildLimits({ ...draft, monthlyCapUsd: "100001" }).ok).toBe(false);
	});

	it("takes a custom plan only above the largest standard plan", () => {
		const draft = { ...installDraftDefaults(), plan: CUSTOM_PLAN, monthlyCapUsd: "100" };
		expect(buildLimits({ ...draft, customPlanPeople: "100" }).ok).toBe(false);
		const built = buildLimits({ ...draft, customPlanPeople: "1,000" });
		expect(built.ok && built.value.plan_people).toBe(1000);
	});

	it("checks the hourly limit and the model spend limit", () => {
		const draft = installDraftDefaults();
		expect(buildLimits({ ...draft, answersPerPersonHour: "0" }).ok).toBe(false);
		expect(buildLimits({ ...draft, answersPerPersonHour: "10001" }).ok).toBe(false);
		expect(buildLimits({ ...draft, tokenLimitUsd: "abc" })).toMatchObject({ ok: false, problem: { field: "tokenLimitUsd" } });
	});
});

describe("Slack agent install payload", () => {
	it("maps the form to POST /slack/install, with blanks as no limit", () => {
		expect(installPayload(installDraftDefaults(), null)).toEqual({
			ok: true,
			value: {
				plan_people: 10,
				over_plan: "refuse",
				max_people: null,
				monthly_cap_usd: 10,
				answers_per_person_hour: 60,
				allow_guests: true,
				allow_external_users: false,
				token_monthly_limit_usd: 0,
				model: "phaseo/auto",
				access_mode: "everyone",
				slack_app_id: null,
			},
		});
	});

	it("sends the company app only when it is chosen", () => {
		const appId = "00000000-0000-4000-8000-0000000000a1";
		const draft = { ...installDraftDefaults(), useCustomApp: true, overPlan: "move_up" as const, maxPeople: "40", tokenLimitUsd: "$30", allowExternalUsers: true, accessMode: "linked" as const };
		const built = installPayload(draft, appId);
		expect(built.ok && built.value).toMatchObject({ slack_app_id: appId, over_plan: "move_up", max_people: 40, token_monthly_limit_usd: 30, allow_external_users: true, access_mode: "linked" });
		const hosted = installPayload({ ...draft, useCustomApp: false }, appId);
		expect(hosted.ok && hosted.value.slack_app_id).toBeNull();
	});

	it("needs a model once a specific model is chosen", () => {
		expect(installPayload({ ...installDraftDefaults(), model: "" }, null)).toEqual({ ok: false, problem: { field: "model", code: "model" } });
		const chosen = installPayload({ ...installDraftDefaults(), model: "anthropic/claude-sonnet-5-5" }, null);
		expect(chosen.ok && chosen.value.model).toBe("anthropic/claude-sonnet-5-5");
	});
});

describe("Slack agent settings patch", () => {
	it("starts from the saved settings and sends nothing until something changes", () => {
		const draft = settingsDraftFrom(saved);
		expect(draft).toMatchObject({ plan: "25", monthlyCapUsd: "12.50", tokenLimitUsd: "", maxPeople: "", channelIds: "C0123ABCD" });
		expect(settingsPatch(draft, draft)).toEqual({ ok: true, value: {} });
	});

	it("sends only the changed fields, in API units", () => {
		const base = settingsDraftFrom(saved);
		const patch = settingsPatch({
			...base,
			instructions: "  Be brief.  ",
			usageDataMode: "dm_and_channels",
			channelIds: "c0123abcd, G0456EFGH\nC0123ABCD",
			allowGuests: false,
			monthlyCapUsd: "40",
		}, base);
		expect(patch).toEqual({
			ok: true,
			value: {
				instructions: "Be brief.",
				usage_data_mode: "dm_and_channels",
				usage_data_channel_ids: ["C0123ABCD", "G0456EFGH"],
				allow_guests: false,
				monthly_cap_usd: 40,
			},
		});
	});

	it("clears optional values with null or 0", () => {
		const base = settingsDraftFrom({ ...saved, instructions: "Old", max_people: 90, token_monthly_limit_usd: 25 });
		const patch = settingsPatch({ ...base, instructions: " ", maxPeople: "", tokenLimitUsd: "" }, base);
		expect(patch).toEqual({ ok: true, value: { instructions: null, max_people: null, token_monthly_limit_usd: 0 } });
	});

	it("sends a custom plan's people when they change", () => {
		const base = settingsDraftFrom({ ...saved, plan_people: 250, monthly_cap_usd: 60 });
		expect(base).toMatchObject({ plan: CUSTOM_PLAN, customPlanPeople: "250" });
		expect(settingsPatch({ ...base, customPlanPeople: "300" }, base)).toEqual({ ok: true, value: { plan_people: 300 } });
		expect(settingsPatch({ ...base, plan: "100" }, base)).toEqual({ ok: true, value: { plan_people: 100 } });
	});

	it("rejects bad channel ids and long instructions", () => {
		const base = settingsDraftFrom(saved);
		expect(settingsPatch({ ...base, channelIds: "general" }, base)).toEqual({ ok: false, problem: { field: "channelIds", code: "channelIds" } });
		expect(settingsPatch({ ...base, instructions: "x".repeat(8_001) }, base)).toMatchObject({ ok: false, problem: { field: "instructions" } });
		expect(parseChannelIds("")).toEqual([]);
	});
});

describe("Slack custom app payload", () => {
	it("checks the app details before they are sent", () => {
		const draft = { slackAppId: " a0123abcdef ", clientId: "1234.5678", clientSecret: "a".repeat(32), signingSecret: "b".repeat(32) };
		expect(customAppPayload(draft)).toEqual({ ok: true, value: { slack_app_id: "A0123ABCDEF", client_id: "1234.5678", client_secret: "a".repeat(32), signing_secret: "b".repeat(32) } });
		expect(customAppPayload({ ...draft, slackAppId: "B0123" })).toEqual({ ok: false, problem: { field: "slackAppId" } });
		expect(customAppPayload({ ...draft, clientId: "1234" })).toEqual({ ok: false, problem: { field: "clientId" } });
		expect(customAppPayload({ ...draft, clientSecret: "short" })).toEqual({ ok: false, problem: { field: "clientSecret" } });
		expect(customAppPayload({ ...draft, signingSecret: "" })).toEqual({ ok: false, problem: { field: "signingSecret" } });
	});
});

describe("Slack agent error messages", () => {
	it.each([
		["payment_due", "paymentDue"],
		["slack_app_conflict", "appConflict"],
		["slack_app_taken", "appTaken"],
		["slack_app_in_use", "appInUse"],
		["forbidden", "forbidden"],
		["chat_privacy_review_required", "privacyReview"],
		["slack_not_configured", "notAvailable"],
		["already_installed", "alreadyInstalled"],
		["slack_team_in_use", "teamInUse"],
		["slack_exchange_failed", "slackError"],
		["slack_response_invalid", "slackResponseInvalid"],
		["state_expired", "stateExpired"],
		["session_mismatch", "sessionMismatch"],
		["key_write_failed", "unavailable"],
		["conflict", "conflict"],
	] as const)("maps %s to its message", (code, key) => {
		expect(slackErrorKey(code, 400)).toBe(key);
	});

	it("falls back on the status, and never treats inherited names as codes", () => {
		expect(slackErrorKey(null, 400)).toBe("invalid");
		expect(slackErrorKey("something_new", 403)).toBe("forbidden");
		expect(slackErrorKey(null, 409)).toBe("conflict");
		expect(slackErrorKey(null, 503)).toBe("unavailable");
		expect(slackErrorKey("toString", null)).toBe("generic");
	});

	it("reads the OAuth callback's result", () => {
		expect(callbackNotice(new URLSearchParams("installed=1&workspaceId=w"))).toEqual({ kind: "installed" });
		expect(callbackNotice(new URLSearchParams("error=slack_denied"))).toEqual({ kind: "error", key: "slackDenied" });
		expect(callbackNotice(new URLSearchParams("error=sign_in_required"))).toEqual({ kind: "error", key: "signInRequired" });
		expect(callbackNotice(new URLSearchParams("error=unheard_of"))).toEqual({ kind: "error", key: "generic" });
		expect(callbackNotice(new URLSearchParams(""))).toBeNull();
	});

	it("explains account linking failures", () => {
		expect(slackLinkErrorKey("link_expired")).toBe("expired");
		expect(slackLinkErrorKey("link_invalid")).toBe("invalid");
		expect(slackLinkErrorKey("forbidden")).toBe("wrongWorkspace");
		expect(slackLinkErrorKey("not_installed")).toBe("notInstalled");
		expect(slackLinkErrorKey("unauthorized")).toBe("signIn");
		expect(slackLinkErrorKey(undefined)).toBe("failed");
	});

	it("accepts only signed link tokens", () => {
		expect(SLACK_LINK_TOKEN_PATTERN.test("eyJhIjoxfQ.c2lnbmF0dXJl_-")).toBe(true);
		expect(SLACK_LINK_TOKEN_PATTERN.test("no-signature")).toBe(false);
		expect(SLACK_LINK_TOKEN_PATTERN.test("a.b<script>")).toBe(false);
	});
});

describe("Slack charge months", () => {
	it("names the month in UTC", () => {
		expect(chargeMonth("2026-10-01", "en-GB")).toBe("October 2026");
		expect(chargeMonth("2026-01-01", "en-US")).toBe("January 2026");
		expect(chargeMonth("bad", "en-GB")).toBe("bad");
	});
});
