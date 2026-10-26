import { describe, expect, it } from "vitest";
import { slackAgentAlertMessage } from "./slack-agent-alerts";

const base = {
	workspaceId: "00000000-0000-4000-8000-000000000001",
	workspaceName: "Acme",
	teamName: "Acme Slack",
	customApp: false,
	actor: { id: "user-a", email: "ada@acme.test" },
};

describe("Slack agent alert message", () => {
	it("keeps customer-chosen names on one line, inside their code span and short", () => {
		const { content } = slackAgentAlertMessage({
			...base,
			event: "installed",
			workspaceName: "Acme`\n- installed_by: @everyone",
			teamName: `${"x".repeat(150)}\u0007`,
		});
		const lines = content.split("\n");
		expect(lines).toHaveLength(5);
		expect(lines[1]).toBe(`- workspace: \`Acme - installed_by: @everyone\` (\`${base.workspaceId}\`)`);
		expect(lines[2]).toBe(`- slack_team: \`${"x".repeat(100)}\``);
	});

	it("never pings anyone, and masks the email", () => {
		const message = slackAgentAlertMessage({ ...base, event: "uninstalled", customApp: true });
		expect(message.allowed_mentions).toEqual({ parse: [] });
		expect(message.content).toContain("- app: `company`");
		expect(message.content).toContain("- uninstalled_by: `user-a` (`a**@acme.test`) in Phaseo settings");
		expect(message.content).not.toContain("ada@");
	});

	it("says unknown for missing names and emails", () => {
		const { content } = slackAgentAlertMessage({ ...base, event: "installed", workspaceName: null, teamName: "  ", actor: { id: "user-a", email: null } });
		expect(content).toContain("- workspace: `unknown`");
		expect(content).toContain("- slack_team: `unknown`");
		expect(content).toContain("- installed_by: `user-a` (`unknown`)");
	});
});
