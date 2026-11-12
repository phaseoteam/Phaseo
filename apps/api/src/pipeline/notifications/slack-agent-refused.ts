import { escapeHtml, stringValue } from "@/pipeline/notifications/model-deprecation";

const SLACK_SETTINGS_URL = "https://phaseo.app/settings/slack";
const CREDITS_SETTINGS_URL = "https://phaseo.app/settings/credits";

type SlackAgentRefusedPayload = Record<string, unknown>;

export type SlackAgentRefusedContent = {
	title: string;
	message: string;
	actionUrl: string;
	actionLabel: string;
};

function count(value: unknown): number | null {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function people(value: number): string {
	return `${value.toLocaleString("en-US")} ${value === 1 ? "person" : "people"}`;
}

function usd(value: unknown): string | null {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0
		? parsed.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
		: null;
}

/**
 * The email owners and admins get the first time in a month the Slack agent turns
 * someone away for a reason only they can fix. It names no Slack user and quotes
 * no message.
 */
export function getSlackAgentRefusedContent(payload: SlackAgentRefusedPayload): SlackAgentRefusedContent {
	const team = stringValue(payload.team_name);
	const agent = team ? `The Phaseo agent in ${team}` : "The Phaseo agent in your Slack workspace";
	const workspace = stringValue(payload.workspace_name) ?? "your workspace";
	const usedBy = count(payload.people);
	const planPeople = count(payload.plan_people);
	const maxPeople = count(payload.max_people);
	const cap = usd(payload.monthly_cap_usd);

	switch (payload.reason) {
		case "plan_full":
			return {
				title: "Slack agent: someone new was turned away",
				message: [
					`${agent} turned away someone new because ${workspace}'s plan covers ${planPeople != null ? people(planPeople) : "a set number of people"} a month${usedBy != null ? ` and ${people(usedBy)} have used it this month` : ""}.`,
					"To let more people in, choose a bigger plan or let the plan move up automatically in the Slack settings.",
				].join(" "),
				actionUrl: SLACK_SETTINGS_URL,
				actionLabel: "Open Slack settings",
			};
		case "max_people":
			return {
				title: "Slack agent: people limit reached",
				message: [
					`${agent} turned away someone new because ${workspace} has reached its limit of ${maxPeople != null ? people(maxPeople) : "people"} a month.`,
					"To let more people in, raise or remove the limit in the Slack settings.",
				].join(" "),
				actionUrl: SLACK_SETTINGS_URL,
				actionLabel: "Open Slack settings",
			};
		case "monthly_cap":
			return {
				title: "Slack agent: monthly spending cap reached",
				message: [
					`${agent} has stopped answering because ${workspace}'s Slack agent spending this month has reached its ${cap ?? "monthly"} cap.`,
					"Answers start again next month, or sooner if you raise the cap in the Slack settings.",
				].join(" "),
				actionUrl: SLACK_SETTINGS_URL,
				actionLabel: "Open Slack settings",
			};
		case "payment_due":
			return {
				title: "Slack agent: paused until the charge is paid",
				message: [
					`${agent} is paused because ${workspace}'s last Slack agent charge couldn't be taken from credits.`,
					"Add credits and the charge is retried every hour. Answers start again as soon as it's paid.",
				].join(" "),
				actionUrl: CREDITS_SETTINGS_URL,
				actionLabel: "Add credits",
			};
		default:
			return {
				title: "Slack agent: someone was turned away",
				message: `${agent} turned someone away. Review its limits in the Slack settings.`,
				actionUrl: SLACK_SETTINGS_URL,
				actionLabel: "Open Slack settings",
			};
	}
}

export function renderSlackAgentRefusedEmail(payload: SlackAgentRefusedPayload): { subject: string; html: string; text: string } {
	const content = getSlackAgentRefusedContent(payload);
	const workspace = stringValue(payload.workspace_name) ?? "your workspace";
	const footer = `You're getting this because you're an owner or admin of ${workspace}. We send it at most once a month for each reason.`;

	return {
		subject: content.title,
		html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"></head>
<body style="margin:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#18181b;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%;">
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;background-color:#ffffff;"><tr><td align="center" style="padding-top:40px;padding-right:20px;padding-bottom:40px;padding-left:20px;">
		<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;min-width:0;background-color:#ffffff;"><tr><td style="font-family:Arial,Helvetica,sans-serif;color:#18181b;font-size:16px;line-height:26px;">
			<table role="presentation" align="center" width="147" cellpadding="0" cellspacing="0" border="0" bgcolor="#0284c7" style="width:147px;margin-bottom:28px;background-color:#0284c7;border-radius:8px;"><tr><td style="padding-top:14px;padding-right:16px;padding-bottom:14px;padding-left:16px;"><img src="https://phaseo.app/wordmark_dark.svg" width="115" height="24" border="0" alt="Phaseo" style="display:block;width:115px;height:24px;border:0;"></td></tr></table>
			<h1 align="center" style="margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;font-size:28px;line-height:34px;letter-spacing:-.02em;color:#09090b;font-weight:500;">${escapeHtml(content.title)}</h1>
			<p style="margin-top:0;margin-right:0;margin-bottom:26px;margin-left:0;font-size:16px;line-height:26px;color:#3f3f46;font-weight:400;">${escapeHtml(content.message)}</p>
			<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:6px;background-color:#0369a1;" bgcolor="#0369a1"><a href="${escapeHtml(content.actionUrl)}" style="display:inline-block;padding-top:11px;padding-right:15px;padding-bottom:11px;padding-left:15px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:16px;text-decoration:none;color:#ffffff;font-weight:600;white-space:nowrap;">${escapeHtml(content.actionLabel)}</a></td></tr></table>
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr><td style="padding-top:18px;padding-right:0;padding-bottom:0;padding-left:0;border-top:1px solid #e4e4e7;"><p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-size:13px;line-height:21px;color:#52525b;font-weight:400;">${escapeHtml(footer)}</p></td></tr></table>
		</td></tr></table>
	</td></tr></table>
</body>
</html>`,
		text: `${content.title}\n\n${content.message}\n\n${content.actionLabel}: ${content.actionUrl}\n\n${footer}`,
	};
}
