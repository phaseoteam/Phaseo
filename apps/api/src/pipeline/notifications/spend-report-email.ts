import { getBindings } from "@/runtime/env";

// Renders a spend_report_email outbox row: the HTML and text email for one owner or admin. The
// payload is private.spend_report_facts plus `recipient` (user id, role, unsubscribe token); every
// figure was summed in the database, this only formats it. English only, like the other account
// emails, with money in US format. Every report carries a per-person, per-workspace unsubscribe
// link and RFC 8058 one-click List-Unsubscribe headers (the same pattern as feedback emails); it
// is never sent without them.

const DEFAULT_WEB_BASE_URL = "https://phaseo.app";
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NANOS_PER_USD = 1_000_000_000;

type Ranked = { name: string; spendNanos: number; requests: number };

export type SpendReportEmail = {
	subject: string;
	html: string;
	text: string;
	headers: Record<string, string>;
};

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("\"", "&quot;")
		.replaceAll("'", "&#39;");
}

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const num = (value: unknown): number | null => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** $1,234.56; amounts under a cent show as <$0.01. */
export function formatUsd(nanos: number): string {
	const usd = nanos / NANOS_PER_USD;
	if (usd > 0 && usd < 0.005) return "<$0.01";
	return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Counts as the mobile digest writes them: 12,340, then 124K, 18.2M, 1.2B. */
export function formatCount(value: number): string {
	const n = Math.max(0, Math.round(value));
	if (n < 100_000) return n.toLocaleString("en-US");
	const units: Array<[number, string]> = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
	for (const [size, suffix] of units) {
		if (n >= size * 0.9995) {
			const scaled = n / size;
			return `${scaled < 100 ? Number(scaled.toFixed(1)) : Math.round(scaled)}${suffix}`;
		}
	}
	return n.toLocaleString("en-US");
}

function ranked(value: unknown, fallback: string): Ranked[] {
	return (Array.isArray(value) ? value : []).map((item) => {
		const row = record(item);
		return { name: str(row.name) ?? fallback, spendNanos: num(row.spend_nanos) ?? 0, requests: num(row.requests) ?? 0 };
	});
}

const CADENCE_WORDS = {
	daily: { adjective: "daily", unit: "day", lead: "on" },
	weekly: { adjective: "weekly", unit: "week", lead: "in the week of" },
	monthly: { adjective: "monthly", unit: "month", lead: "in" },
} as const;

function webBaseUrl(): string {
	return (getBindings().PHASEO_WEB_BASE_URL?.trim() || DEFAULT_WEB_BASE_URL).replace(/\/+$/, "");
}

export function renderSpendReportEmail(payload: Record<string, unknown>): SpendReportEmail {
	const recipient = record(payload.recipient);
	const token = str(recipient.unsubscribe_token) ?? "";
	// No unsubscribe link, no email.
	if (!TOKEN_PATTERN.test(token)) throw new Error("invalid_spend_report_unsubscribe_token");

	const cadence = payload.cadence === "daily" || payload.cadence === "monthly" ? payload.cadence : "weekly";
	const words = CADENCE_WORDS[cadence];
	const workspace = str(payload.workspace_name) ?? "Your workspace";
	const period = record(payload.period);
	const label = str(period.label) ?? "";
	const zone = str(payload.time_zone) ?? "UTC";
	const totals = record(payload.totals);
	const previous = record(payload.previous_totals);
	const change = record(payload.change);
	const spend = num(totals.spend_nanos) ?? 0;
	const previousSpend = num(previous.spend_nanos) ?? 0;
	const percent = num(change.spend_percent);
	const requests = num(totals.requests) ?? 0;
	const tokens = num(totals.tokens) ?? 0;
	const base = webBaseUrl();
	const usageUrl = `${base}/settings/usage/overview`;
	const settingsUrl = `${base}/settings/notifications#spend-alerts`;
	const unsubscribeUrl = `${base}/spend-reports/${token}/unsubscribe`;
	const oneClickUrl = `${base}/api/_web/spend-reports/${token}/unsubscribe`;

	const subject = str(payload.title) ?? `${workspace} ${words.adjective} spend: ${formatUsd(spend)}${label ? ` (${label})` : ""}`;
	const changeLine = percent === null
		? `No spend the ${words.unit} before.`
		: percent > 0
			? `Up ${percent}% on the ${words.unit} before (${formatUsd(previousSpend)}).`
			: percent < 0
				? `Down ${Math.abs(percent)}% on the ${words.unit} before (${formatUsd(previousSpend)}).`
				: `The same as the ${words.unit} before.`;
	const activityLine = `${formatCount(requests)} ${requests === 1 ? "request" : "requests"} · ${formatCount(tokens)} tokens`;

	const sections: Array<{ title: string; rows: Ranked[]; note?: string }> = [
		{ title: "Top models", rows: ranked(payload.top_models, "Unknown model") },
		{ title: "Top API keys", rows: ranked(payload.top_keys, "No API key") },
		{ title: "Top members", rows: ranked(payload.top_members, "Unknown member") },
		{
			title: "Top departments",
			rows: ranked(payload.top_departments, "Deleted department"),
			note: payload.department_attribution === "primary"
				? "Each person counts toward their primary department."
				: "People in more than one department count toward each.",
		},
	].filter((section) => section.rows.length > 0);

	const forecast = record(payload.forecast);
	const monthLabel = str(forecast.month_label) ?? "This month";
	const projected = num(forecast.projected_nanos);
	const monthSoFar = num(forecast.spend_nanos) ?? 0;
	const forecastFrom = str(forecast.from);
	const forecastLine = projected !== null
		? `${monthLabel} forecast: ${formatUsd(projected)} at the pace so far (${formatUsd(monthSoFar)} spent).`
		: `${monthLabel} so far: ${formatUsd(monthSoFar)}. The forecast starts${forecastFrom ? ` on ${new Date(forecastFrom).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: zone })}` : " after the first 3 days"}.`;
	const runway = payload.runway === null || payload.runway === undefined ? null : record(payload.runway);
	const runwayDays = runway ? num(runway.runway_days) : null;
	const balanceLine = runway
		? `Balance: ${formatUsd(num(runway.available_nanos) ?? 0)} available${runwayDays !== null ? `, about ${runwayDays < 10 ? Number(runwayDays.toFixed(1)) : Math.round(runwayDays)} days at the last 7 days' pace` : ""}.${runway.auto_top_up === true ? " Auto Top-Up is on." : ""}`
		: null;

	const alerts = record(payload.alerts);
	const fired = num(alerts.fired) ?? 0;
	const alertRules = (Array.isArray(alerts.rules) ? alerts.rules : []).map((item) => {
		const row = record(item);
		return { name: str(row.rule_name) ?? "Spend rule", fired: num(row.fired) ?? 0, last: str(row.last_title) };
	});
	const blocks = record(payload.blocks);
	const activeBlocks = num(blocks.active) ?? 0;
	const startedBlocks = num(blocks.started) ?? 0;
	const blockItems = (Array.isArray(blocks.items) ? blocks.items : []).map((item) => {
		const row = record(item);
		return { rule: str(row.rule_name) ?? "Spend rule", scope: str(row.scope_label), active: row.active === true };
	});

	const role = recipient.role === "admin" ? "an admin" : "an owner";
	const footer = `You're getting this because you're ${role} of ${workspace}, which sends ${words.adjective} spend reports. Owners and admins can change how often they're sent in Settings → Notifications.`;

	// ---- HTML: table layout and inline styles, for email clients.
	const muted = "color: #64748b;";
	const cell = "padding: 6px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px;";
	const p = (content: string, style = "") => `<p style="margin: 0 0 12px; ${style}">${content}</p>`;
	const table = (section: { title: string; rows: Ranked[]; note?: string }) => [
		`<h3 style="margin: 20px 0 6px; font-size: 15px;">${escapeHtml(section.title)}</h3>`,
		"<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse: collapse;\">",
		...section.rows.map((row) => `<tr><td style="${cell}">${escapeHtml(row.name)}</td><td style="${cell} text-align: right; ${muted} white-space: nowrap;">${escapeHtml(formatCount(row.requests))} req</td><td style="${cell} text-align: right; white-space: nowrap; width: 96px;">${escapeHtml(formatUsd(row.spendNanos))}</td></tr>`),
		"</table>",
		section.note ? `<p style="margin: 6px 0 0; font-size: 12px; ${muted}">${escapeHtml(section.note)}</p>` : "",
	].join("");
	const html = [
		"<div style=\"font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.5; color: #0f172a; max-width: 560px;\">",
		`<p style="margin: 0 0 4px; font-size: 13px; ${muted}">${escapeHtml(workspace)} · ${escapeHtml(words.adjective)} spend report</p>`,
		`<h2 style="margin: 0 0 4px; font-size: 20px;">${escapeHtml(label)}</h2>`,
		p(`<span style="font-size: 13px; ${muted}">${escapeHtml(zone)}</span>`),
		`<p style="margin: 0 0 4px; font-size: 32px; font-weight: 600;">${escapeHtml(formatUsd(spend))}</p>`,
		p(escapeHtml(changeLine)),
		p(escapeHtml(activityLine), muted),
		...sections.map(table),
		`<h3 style="margin: 20px 0 6px; font-size: 15px;">Forecast and balance</h3>`,
		p(escapeHtml(forecastLine)),
		balanceLine ? p(escapeHtml(balanceLine)) : "",
		fired > 0 || activeBlocks > 0 || startedBlocks > 0 ? `<h3 style="margin: 20px 0 6px; font-size: 15px;">Spend alerts</h3>` : "",
		fired > 0
			? p(`${escapeHtml(`${fired} ${fired === 1 ? "alert" : "alerts"} fired:`)}<br>${alertRules.map((rule) => escapeHtml(`${rule.name}: ${rule.fired}×${rule.last ? ` (last: ${rule.last})` : ""}`)).join("<br>")}`)
			: "",
		activeBlocks > 0 || startedBlocks > 0
			? p(`${escapeHtml(`Blocks: ${activeBlocks} active now, ${startedBlocks} started in this ${words.unit}.`)}<br>${blockItems.map((block) => escapeHtml(`${block.rule}${block.scope ? ` (${block.scope})` : ""}: ${block.active ? "blocking" : "lifted"}`)).join("<br>")}`)
			: "",
		`<p style="margin: 24px 0 12px;"><a href="${escapeHtml(usageUrl)}" style="display: inline-block; padding: 10px 16px; border-radius: 8px; background: #0069a8; color: #ffffff; text-decoration: none; font-weight: 600;">Open usage</a></p>`,
		p(`<a href="${escapeHtml(settingsUrl)}">Manage spend alerts and reports</a>`, "font-size: 14px;"),
		`<p style="margin: 24px 0 0; font-size: 12px; ${muted}">${escapeHtml(footer)} <a href="${escapeHtml(unsubscribeUrl)}" style="${muted}">Unsubscribe from these reports</a></p>`,
		"</div>",
	].join("");

	// ---- Text.
	const textSections = sections.flatMap((section) => [
		"",
		`${section.title}:`,
		...section.rows.map((row) => `- ${row.name}: ${formatUsd(row.spendNanos)} (${formatCount(row.requests)} ${row.requests === 1 ? "request" : "requests"})`),
		...(section.note ? [section.note] : []),
	]);
	const text = [
		`${workspace}: ${words.adjective} spend report`,
		`${label} (${zone})`,
		"",
		`Spent ${formatUsd(spend)} ${words.lead} ${label}. ${changeLine}`,
		activityLine,
		...textSections,
		"",
		forecastLine,
		...(balanceLine ? [balanceLine] : []),
		...(fired > 0 ? ["", `Spend alerts: ${fired} fired.`, ...alertRules.map((rule) => `- ${rule.name}: ${rule.fired}×${rule.last ? ` (last: ${rule.last})` : ""}`)] : []),
		...(activeBlocks > 0 || startedBlocks > 0
			? [`Blocks: ${activeBlocks} active now, ${startedBlocks} started in this ${words.unit}.`, ...blockItems.map((block) => `- ${block.rule}${block.scope ? ` (${block.scope})` : ""}: ${block.active ? "blocking" : "lifted"}`)]
			: []),
		"",
		`Open usage: ${usageUrl}`,
		`Manage spend alerts and reports: ${settingsUrl}`,
		"",
		`${footer} Unsubscribe from these reports: ${unsubscribeUrl}`,
	].join("\n");

	return {
		subject,
		html,
		text,
		headers: {
			"List-Unsubscribe": `<${oneClickUrl}>`,
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		},
	};
}
