import { describe, expect, it } from "vitest";
import { getSlackAgentRefusedContent, renderSlackAgentRefusedEmail } from "./slack-agent-refused";

const payload = {
	workspace_name: "Acme <Labs>",
	team_name: "Acme Slack",
	people: 10,
	plan_people: 10,
	max_people: 40,
	monthly_cap_usd: 1250.5,
};

describe("Slack agent refusal email", () => {
	it("says why someone new was turned away and what fixes it", () => {
		const full = getSlackAgentRefusedContent({ ...payload, reason: "plan_full" });
		expect(full.title).toBe("Slack agent: someone new was turned away");
		expect(full.message).toBe("The Phaseo agent in Acme Slack turned away someone new because Acme <Labs>'s plan covers 10 people a month and 10 people have used it this month. To let more people in, choose a bigger plan or let the plan move up automatically in the Slack settings.");
		expect(full.actionUrl).toBe("https://phaseo.app/settings/slack");

		const limit = getSlackAgentRefusedContent({ ...payload, reason: "max_people", max_people: 1 });
		expect(limit.message).toContain("has reached its limit of 1 person a month.");

		const cap = getSlackAgentRefusedContent({ ...payload, reason: "monthly_cap" });
		expect(cap.title).toBe("Slack agent: monthly spending cap reached");
		expect(cap.message).toContain("has reached its $1,250.50 cap.");
		expect(cap.message).toContain("Answers start again next month, or sooner if you raise the cap");
	});

	it("sends an unpaid charge to the credits page", () => {
		const due = getSlackAgentRefusedContent({ ...payload, reason: "payment_due" });
		expect(due.title).toBe("Slack agent: paused until the charge is paid");
		expect(due.actionUrl).toBe("https://phaseo.app/settings/credits");
		expect(due.actionLabel).toBe("Add credits");
	});

	it("still reads well when the payload is missing details", () => {
		const content = getSlackAgentRefusedContent({ reason: "plan_full" });
		expect(content.message).toBe("The Phaseo agent in your Slack workspace turned away someone new because your workspace's plan covers a set number of people a month. To let more people in, choose a bigger plan or let the plan move up automatically in the Slack settings.");
		expect(getSlackAgentRefusedContent({ reason: "monthly_cap", monthly_cap_usd: "x" }).message).toContain("has reached its monthly cap.");
	});

	it("escapes workspace and team names in the HTML", () => {
		const email = renderSlackAgentRefusedEmail({ ...payload, team_name: "<b>Team</b>", reason: "max_people" });
		expect(email.subject).toBe("Slack agent: people limit reached");
		expect(email.html).toContain("&lt;b&gt;Team&lt;/b&gt;");
		expect(email.html).toContain("Acme &lt;Labs&gt;");
		expect(email.html).not.toContain("<b>Team</b>");
		expect(email.text).toContain("You're getting this because you're an owner or admin of Acme <Labs>. We send it at most once a month for each reason.");
	});
});
