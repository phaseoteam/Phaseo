import { describe, expect, it, vi } from "vitest";

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({ PHASEO_WEB_BASE_URL: "https://phaseo.app/" }),
}));

import { formatCount, formatUsd, renderSpendReportEmail } from "./spend-report-email";

const TOKEN = "4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

// The payload private.spend_report_facts produced for the PGlite fixture (supabase/tests/spend-reports.test.mjs).
const payload = {
	version: 1,
	workspace_name: "Acme",
	cadence: "weekly",
	time_zone: "Europe/London",
	title: "Acme weekly spend: $90.00 (Oct 12 – Oct 18, 2026)",
	period: { start: "2026-10-11T23:00:00+00:00", end: "2026-10-18T23:00:00+00:00", label: "Oct 12 – Oct 18, 2026", local_start: "2026-10-12", local_end: "2026-10-18" },
	totals: { spend_nanos: 90e9, requests: 182, successful_requests: 182, tokens: 18300, input_tokens: 11200, output_tokens: 7100 },
	previous_totals: { spend_nanos: 60e9, requests: 2, tokens: 0 },
	change: { spend_nanos: 30e9, spend_percent: 50 },
	top_keys: [{ id: "k1", name: "prod", spend_nanos: 50e9, requests: 102 }, { id: "k2", name: "staging", spend_nanos: 25e9, requests: 50 }, { id: "k3", name: "member-key", spend_nanos: 15e9, requests: 30 }],
	top_models: [{ id: "openai/gpt-5", name: "GPT-5", spend_nanos: 65e9, requests: 132 }, { id: "anthropic/claude", name: "Claude", spend_nanos: 25e9, requests: 50 }],
	top_members: [{ user_id: "u1", name: "Olivia Owner", email: "owner@example.com", spend_nanos: 48e9, requests: 101 }, { user_id: "u2", name: "admin@example.com", email: "admin@example.com", spend_nanos: 25e9, requests: 50 }, { user_id: "u3", name: "Max Member", email: "member@example.com", spend_nanos: 21e9, requests: 31 }],
	top_departments: [{ id: "d2", name: "Operations", spend_nanos: 46e9, requests: 81 }, { id: "d1", name: "Engineering", spend_nanos: 21e9, requests: 31 }],
	department_attribution: "all",
	forecast: { month_start: "2026-09-30T23:00:00+00:00", month_end: "2026-10-31T23:00:00+00:00", month_label: "October", from: "2026-10-03T23:00:00+00:00", spend_nanos: 161e9, projected_nanos: 271.68e9 },
	runway: { balance_nanos: 500e9, reserved_nanos: 20e9, available_nanos: 480e9, window_hours: 168, burn_nanos: 101e9, burn_per_day_nanos: 14.43e9, runway_days: 33.27, auto_top_up: false },
	alerts: { fired: 3, rules: [{ rule_id: "r1", rule_name: "Monthly", metric: "budget_percent", fired: 2, last_title: "Monthly: 80% of $100.00 reached" }, { rule_id: "r2", rule_name: "Spike", metric: "spike", fired: 1, last_title: "Spike: spend 4.2× usual in the last 3 hours" }] },
	blocks: { active: 1, started: 1, items: [{ block_id: "b1", rule_name: "Daily cap", scope_label: "Acme", active: true }, { block_id: "b2", rule_name: "Deleted rule", scope_label: "Acme", active: false }] },
	recipient: { user_id: "u1", role: "owner", unsubscribe_token: TOKEN },
};

describe("spend report email", () => {
	it("renders the report as text and HTML with a one-click unsubscribe", () => {
		const email = renderSpendReportEmail(payload);
		if (process.env.SPEND_REPORT_SAMPLE === "1") console.log(`Subject: ${email.subject}\n\n${email.text}`);
		expect(email.subject).toBe("Acme weekly spend: $90.00 (Oct 12 – Oct 18, 2026)");
		expect(email.headers).toEqual({
			"List-Unsubscribe": `<https://phaseo.app/api/_web/spend-reports/${TOKEN}/unsubscribe>`,
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		});
		const lines = email.text.split("\n");
		expect(lines.slice(0, 5)).toEqual([
			"Acme: weekly spend report",
			"Oct 12 – Oct 18, 2026 (Europe/London)",
			"",
			"Spent $90.00 in the week of Oct 12 – Oct 18, 2026. Up 50% on the week before ($60.00).",
			"182 requests · 18,300 tokens",
		]);
		expect(email.text).toContain("Top models:\n- GPT-5: $65.00 (132 requests)\n- Claude: $25.00 (50 requests)");
		expect(email.text).toContain("Top API keys:\n- prod: $50.00 (102 requests)");
		expect(email.text).toContain("Top members:\n- Olivia Owner: $48.00 (101 requests)");
		expect(email.text).toContain("Top departments:\n- Operations: $46.00 (81 requests)\n- Engineering: $21.00 (31 requests)\nPeople in more than one department count toward each.");
		expect(email.text).toContain("October forecast: $271.68 at the pace so far ($161.00 spent).");
		expect(email.text).toContain("Balance: $480.00 available, about 33 days at the last 7 days' pace.");
		expect(email.text).toContain("Spend alerts: 3 fired.\n- Monthly: 2× (last: Monthly: 80% of $100.00 reached)");
		expect(email.text).toContain("Blocks: 1 active now, 1 started in this week.\n- Daily cap (Acme): blocking\n- Deleted rule (Acme): lifted");
		expect(email.text).toContain("Open usage: https://phaseo.app/settings/usage/overview");
		expect(email.text).toContain(`You're getting this because you're an owner of Acme, which sends weekly spend reports.`);
		expect(email.text).toContain(`Unsubscribe from these reports: https://phaseo.app/spend-reports/${TOKEN}/unsubscribe`);
		expect(email.html).toContain(`href="https://phaseo.app/spend-reports/${TOKEN}/unsubscribe"`);
		expect(email.html).toContain("$90.00");
		expect(email.html).not.toMatch(/border-radius:\s*(9999|[1-9]\d)px/);
	});

	it("escapes names and leaves out empty sections", () => {
		const email = renderSpendReportEmail({
			...payload,
			workspace_name: "<b>Acme</b>",
			top_keys: [{ id: "k", name: "<script>alert(1)</script>", spend_nanos: 1e9, requests: 1 }],
			top_members: [],
			top_departments: [],
			alerts: { fired: 0, rules: [] },
			blocks: { active: 0, started: 0, items: [] },
			runway: null,
			forecast: { month_label: "November", spend_nanos: 2e9, projected_nanos: null, from: "2026-11-04T00:00:00Z" },
			change: { spend_percent: null },
			cadence: "monthly",
			period: { label: "October 2026" },
			time_zone: "UTC",
			recipient: { role: "admin", unsubscribe_token: TOKEN },
		});
		expect(email.html).not.toContain("<script>");
		expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(email.html).toContain("&lt;b&gt;Acme&lt;/b&gt;");
		expect(email.text).not.toContain("Top members");
		expect(email.text).not.toContain("Top departments");
		expect(email.text).not.toContain("Spend alerts");
		expect(email.text).not.toContain("Balance:");
		expect(email.text).toContain("Spent $90.00 in October 2026. No spend the month before.");
		expect(email.text).toContain("November so far: $2.00. The forecast starts on Nov 4.");
		expect(email.text).toContain("you're an admin of <b>Acme</b>, which sends monthly spend reports");
	});

	it("refuses to render without a valid unsubscribe token", () => {
		expect(() => renderSpendReportEmail({ ...payload, recipient: { role: "owner" } })).toThrow("invalid_spend_report_unsubscribe_token");
		expect(() => renderSpendReportEmail({ ...payload, recipient: { unsubscribe_token: "not-a-token" } })).toThrow("invalid_spend_report_unsubscribe_token");
	});

	it("formats money and counts the way the digest does", () => {
		expect(formatUsd(1_234_560_000_000)).toBe("$1,234.56");
		expect(formatUsd(0)).toBe("$0.00");
		expect(formatUsd(1_000_000)).toBe("<$0.01");
		expect(formatCount(12_340)).toBe("12,340");
		expect(formatCount(124_400)).toBe("124K");
		expect(formatCount(18_240_000)).toBe("18.2M");
		expect(formatCount(1_200_000_000)).toBe("1.2B");
	});
});
