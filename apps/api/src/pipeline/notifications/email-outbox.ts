import { getSupabaseAdmin } from "@/runtime/env";
import { sendEmail } from "@/lib/email/resend";
import { getBindings } from "@/runtime/env";

type OutboxRow = {
	id: string;
	created_at: string;
	kind: string;
	template: string;
	to_email: string;
	subject: string | null;
	workspace_id: string | null;
	user_id: string | null;
	payload: Record<string, unknown> | null;
	attempts: number;
	last_error: string | null;
	sent_at: string | null;
};

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("\"", "&quot;")
		.replaceAll("'", "&#39;");
}

function renderWelcomeEmail(): { subject: string; html: string; text: string } {
	return {
		subject: "Welcome to Phaseo",
		html: [
			"<div style=\"font-family: ui-sans-serif, system-ui; line-height: 1.5;\">",
			"<h2 style=\"margin: 0 0 12px;\">Welcome to Phaseo</h2>",
			"<p style=\"margin: 0 0 12px;\">Your account is ready. You can now explore models, generate text, and manage billing from Settings.</p>",
			"<p style=\"margin: 0;\">If you run into issues, reply to this email and we’ll help.</p>",
			"</div>",
		].join(""),
		text: "Welcome to Phaseo\n\nYour account is ready. You can now explore models, generate text, and manage billing from Settings.\n\nIf you run into issues, reply to this email and we’ll help.",
	};
}

function renderLowBalanceEmail(payload: Record<string, unknown> | null): {
	subject: string;
	html: string;
	text: string;
} {
	const teamName = typeof payload?.team_name === "string" ? payload.team_name : "your team";
	const balanceUsd =
		typeof payload?.balance_usd === "number" ? payload.balance_usd : null;
	const thresholdUsd =
		typeof payload?.threshold_usd === "number" ? payload.threshold_usd : null;

	const subject = "Low balance alert";
	const bodyLine =
		balanceUsd != null && thresholdUsd != null
			? `Your Phaseo balance for ${teamName} is $${balanceUsd.toFixed(2)} (threshold: $${thresholdUsd.toFixed(2)}).`
			: `Your Phaseo balance for ${teamName} is below your configured threshold.`;

	return {
		subject,
		html: [
			"<div style=\"font-family: ui-sans-serif, system-ui; line-height: 1.5;\">",
			"<h2 style=\"margin: 0 0 12px;\">Low balance alert</h2>",
			`<p style=\"margin: 0 0 12px;\">${bodyLine}</p>`,
			"<p style=\"margin: 0;\">Top up credits in Settings → Credits.</p>",
			"</div>",
		].join(""),
		text: `Low balance alert\n\n${bodyLine}\n\nTop up credits in Settings -> Credits.`,
	};
}

function renderSecurityLeakedKeyEmail(payload: Record<string, unknown> | null): {
	subject: string;
	html: string;
	text: string;
} {
	const workspaceName =
		typeof payload?.workspace_name === "string" && payload.workspace_name.trim()
			? payload.workspace_name.trim()
			: "your workspace";
	const keyPreview =
		typeof payload?.key_preview === "string" && payload.key_preview.trim()
			? payload.key_preview.trim()
			: "the reported key";
	const source =
		typeof payload?.reported_source === "string" && payload.reported_source.trim()
			? payload.reported_source.trim()
			: "an external source";
	const evidenceUrl =
		typeof payload?.evidence_url === "string" && payload.evidence_url.trim()
			? payload.evidence_url.trim()
			: null;
	const autoRevoked = payload?.auto_revoked === true;
	const subject = autoRevoked
		? "Security alert: exposed API key revoked"
		: "Security alert: exposed API key reported";
	const lead = autoRevoked
		? `A Phaseo API key for ${workspaceName} was reported as publicly exposed and has been revoked.`
		: `A Phaseo API key for ${workspaceName} was reported as publicly exposed.`;
	const actionLine = autoRevoked
		? "Create a replacement key and update any environments that were using the exposed key."
		: "Review the key immediately and rotate or revoke it if the exposure is legitimate.";
	const escapedSubject = escapeHtml(subject);
	const escapedLead = escapeHtml(lead);
	const escapedKeyPreview = escapeHtml(keyPreview);
	const escapedSource = escapeHtml(source);
	const escapedActionLine = escapeHtml(actionLine);
	const escapedEvidenceUrl = evidenceUrl ? escapeHtml(evidenceUrl) : null;

	return {
		subject,
		html: [
			"<div style=\"font-family: ui-sans-serif, system-ui; line-height: 1.5;\">",
			`<h2 style="margin: 0 0 12px;">${escapedSubject}</h2>`,
			`<p style="margin: 0 0 12px;">${escapedLead}</p>`,
			`<p style="margin: 0 0 12px;"><strong>Key:</strong> ${escapedKeyPreview}</p>`,
			`<p style="margin: 0 0 12px;"><strong>Reported source:</strong> ${escapedSource}</p>`,
			escapedEvidenceUrl
				? `<p style="margin: 0 0 12px;"><strong>Evidence:</strong> <a href="${escapedEvidenceUrl}">${escapedEvidenceUrl}</a></p>`
				: "",
			`<p style="margin: 0;">${escapedActionLine}</p>`,
			"</div>",
		].join(""),
		text: [
			subject,
			"",
			lead,
			`Key: ${keyPreview}`,
			`Reported source: ${source}`,
			evidenceUrl ? `Evidence: ${evidenceUrl}` : null,
			"",
			actionLine,
		]
			.filter(Boolean)
			.join("\n"),
	};
}

function renderIoRetentionEmail(
	payload: Record<string, unknown> | null,
	kind: "grace" | "suspended",
): {
	subject: string;
	html: string;
	text: string;
} {
	const workspaceName =
		typeof payload?.workspace_name === "string" && payload.workspace_name.trim()
			? payload.workspace_name.trim()
			: "your workspace";
	const amountUsd =
		typeof payload?.amount_usd === "number" && Number.isFinite(payload.amount_usd)
			? payload.amount_usd
			: null;
	const eventUnits =
		typeof payload?.event_units === "number" && Number.isFinite(payload.event_units)
			? payload.event_units
			: typeof payload?.event_units === "string"
				? Number(payload.event_units)
				: null;
	const retentionDays =
		typeof payload?.retention_days === "number" && Number.isFinite(payload.retention_days)
			? payload.retention_days
			: 90;
	const graceUntil =
		typeof payload?.grace_until === "string" && payload.grace_until.trim()
			? payload.grace_until.trim()
			: null;
	const subject =
		kind === "grace"
			? "I/O log retention billing paused"
			: "I/O log extended retention suspended";
	const escapedSubject = escapeHtml(subject);
	const escapedWorkspace = escapeHtml(workspaceName);
	const amountLine = amountUsd != null
		? `The estimated daily charge is $${amountUsd.toFixed(4)}.`
		: "The daily extended-retention charge could not be collected.";
	const unitsLine =
		eventUnits != null && Number.isFinite(eventUnits)
			? `${Math.trunc(eventUnits).toLocaleString()} retained log units are currently billable.`
			: "Extended-retention log units are currently billable.";
	const graceLine = graceUntil
		? `Grace period ends on ${new Date(graceUntil).toUTCString()}.`
		: "Top up credits to resume extended retention.";
	const lead =
		kind === "grace"
			? `Phaseo could not collect credits for ${retentionDays}-day I/O log retention on ${workspaceName}.`
			: `Extended I/O log retention for ${workspaceName} is suspended. Logs older than the included 90-day window may be deleted.`;
	const action =
		kind === "grace"
			? "Add credits before the grace period ends to keep extended I/O log retention active."
			: "Add credits and re-enable extended retention to keep future logs beyond the included 90-day window.";

	return {
		subject,
		html: [
			"<div style=\"font-family: ui-sans-serif, system-ui; line-height: 1.5;\">",
			`<h2 style="margin: 0 0 12px;">${escapedSubject}</h2>`,
			`<p style="margin: 0 0 12px;">${escapeHtml(lead)}</p>`,
			`<p style="margin: 0 0 12px;">${escapeHtml(amountLine)} ${escapeHtml(unitsLine)}</p>`,
			`<p style="margin: 0 0 12px;">${escapeHtml(graceLine)}</p>`,
			`<p style="margin: 0;">${escapeHtml(action)}</p>`,
			`<p style="margin: 12px 0 0; color: #64748b;">Workspace: ${escapedWorkspace}</p>`,
			"</div>",
		].join(""),
		text: [
			subject,
			"",
			lead,
			`${amountLine} ${unitsLine}`,
			graceLine,
			"",
			action,
			`Workspace: ${workspaceName}`,
		].join("\n"),
	};
}

function renderEmailForRow(row: OutboxRow): {
	subject: string;
	templateId?: string;
	variables?: Record<string, string | number>;
	html?: string;
	text?: string;
} {
	const bindings = getBindings();
	if (row.template === "welcome" || row.kind === "welcome") {
		const templateId = bindings.RESEND_TEMPLATE_WELCOME_ID?.trim() || "";
		if (!templateId) throw new Error("missing_resend_template_welcome_id");

		const payload = row.payload ?? {};
		return {
			subject: row.subject ?? "Welcome to Phaseo",
			templateId,
			variables: {
				USER_FIRST_NAME:
					(typeof payload.user_first_name === "string" && payload.user_first_name.trim()) ||
					"there",
			},
		};
	}
	if (row.template === "low_balance" || row.kind === "low_balance") {
		const templateId = bindings.RESEND_TEMPLATE_LOW_BALANCE_ID?.trim() || "";
		if (!templateId) throw new Error("missing_resend_template_low_balance_id");

		const payload = row.payload ?? {};
		const balanceUsd = typeof payload.balance_usd === "number" ? payload.balance_usd : null;
		const thresholdUsd =
			typeof payload.threshold_usd === "number" ? payload.threshold_usd : null;
		const teamName =
			typeof payload.team_name === "string" && payload.team_name.trim()
				? payload.team_name.trim()
				: "your workspace";

		return {
			subject: row.subject ?? "Low balance alert",
			templateId,
			variables: {
				USER_FIRST_NAME:
					(typeof payload.user_first_name === "string" && payload.user_first_name.trim()) ||
					"there",
				BALANCE_REMAINING: balanceUsd ?? "",
				LOW_BALANCE_THRESHOLD: thresholdUsd ?? "",
				WORKSPACE_NAME: teamName,
			},
		};
	}
	if (row.template === "security_leaked_key" || row.kind === "security_leaked_key") {
		const rendered = renderSecurityLeakedKeyEmail(row.payload ?? {});
		return {
			subject: row.subject ?? rendered.subject,
			html: rendered.html,
			text: rendered.text,
		};
	}
	if (row.template === "io_retention_grace" || row.kind === "io_retention_grace") {
		const rendered = renderIoRetentionEmail(row.payload ?? {}, "grace");
		return {
			subject: row.subject ?? rendered.subject,
			html: rendered.html,
			text: rendered.text,
		};
	}
	if (row.template === "io_retention_suspended" || row.kind === "io_retention_suspended") {
		const rendered = renderIoRetentionEmail(row.payload ?? {}, "suspended");
		return {
			subject: row.subject ?? rendered.subject,
			html: rendered.html,
			text: rendered.text,
		};
	}
	throw new Error(`unsupported_email_template:${row.template || row.kind}`);
}

export async function drainEmailOutbox(limit = 25): Promise<{
	processed: number;
	sent: number;
	failed: number;
}> {
	const supabase = getSupabaseAdmin();
	const bindings = getBindings();

	const { data, error } = await supabase
		.from("email_outbox")
		.select(
			"id,created_at,kind,template,to_email,subject,workspace_id,user_id,payload,attempts,last_error,sent_at",
		)
		.is("sent_at", null)
		.lt("attempts", 5)
		.order("created_at", { ascending: true })
		.limit(limit);

	if (error) {
		throw new Error(`email_outbox_fetch_error:${error.message ?? "unknown"}`);
	}

	const rows = (data ?? []) as unknown as OutboxRow[];
	let sent = 0;
	let failed = 0;

	for (const row of rows) {
		try {
			// Best-effort enrichment for template variables.
			// (We keep this at send-time so the DB trigger can stay minimal.)
			if (
				(row.template === "welcome" ||
					row.kind === "welcome" ||
					row.template === "low_balance" ||
					row.kind === "low_balance") &&
				(bindings.RESEND_TEMPLATE_WELCOME_ID?.trim() ||
					bindings.RESEND_TEMPLATE_LOW_BALANCE_ID?.trim())
			) {
				if (!row.payload) row.payload = {};
				if (!row.payload.user_first_name && row.user_id) {
					try {
						const userRes = await (supabase as any).auth.admin.getUserById(row.user_id);
						const meta = userRes?.data?.user?.user_metadata ?? {};
						const first =
							(typeof meta?.first_name === "string" && meta.first_name.trim()) ||
							(typeof meta?.given_name === "string" && meta.given_name.trim()) ||
							(typeof meta?.full_name === "string" && meta.full_name.trim().split(/\s+/)[0]) ||
							(typeof meta?.name === "string" && meta.name.trim().split(/\s+/)[0]) ||
							"";
						if (first) {
							(row.payload as any).user_first_name = first;
						}
					} catch {
						// ignore enrichment failures
					}
				}
			}

			const rendered = renderEmailForRow(row);
			if (rendered.templateId) {
				await sendEmail({
					to: row.to_email,
					subject: rendered.subject,
					template: { id: rendered.templateId, variables: rendered.variables },
				});
			} else {
				await sendEmail({
					to: row.to_email,
					subject: rendered.subject,
					html: rendered.html,
					text: rendered.text,
				});
			}

			const { error: updateErr } = await supabase
				.from("email_outbox")
				.update({
					sent_at: new Date().toISOString(),
					last_error: null,
				})
				.eq("id", row.id);

			if (updateErr) {
				throw new Error(`email_outbox_update_error:${updateErr.message ?? "unknown"}`);
			}

			sent += 1;
		} catch (err) {
			failed += 1;
			const message = err instanceof Error ? err.message : String(err);
			await supabase
				.from("email_outbox")
				.update({
					attempts: (row.attempts ?? 0) + 1,
					last_error: message.slice(0, 2000),
				})
				.eq("id", row.id);
		}
	}

	return { processed: rows.length, sent, failed };
}

