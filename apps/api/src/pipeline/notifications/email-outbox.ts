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
	team_id: string | null;
	user_id: string | null;
	payload: Record<string, unknown> | null;
	attempts: number;
	last_error: string | null;
	sent_at: string | null;
};

function renderWelcomeEmail(): { subject: string; html: string; text: string } {
	return {
		subject: "Welcome to AI Stats",
		html: [
			"<div style=\"font-family: ui-sans-serif, system-ui; line-height: 1.5;\">",
			"<h2 style=\"margin: 0 0 12px;\">Welcome to AI Stats</h2>",
			"<p style=\"margin: 0 0 12px;\">Your account is ready. You can now explore models, generate text, and manage billing from Settings.</p>",
			"<p style=\"margin: 0;\">If you run into issues, reply to this email and we’ll help.</p>",
			"</div>",
		].join(""),
		text: "Welcome to AI Stats\n\nYour account is ready. You can now explore models, generate text, and manage billing from Settings.\n\nIf you run into issues, reply to this email and we’ll help.",
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
			? `Your AI Stats balance for ${teamName} is $${balanceUsd.toFixed(2)} (threshold: $${thresholdUsd.toFixed(2)}).`
			: `Your AI Stats balance for ${teamName} is below your configured threshold.`;

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

function renderEmailForRow(row: OutboxRow): {
	subject: string;
	templateId: string;
	variables: Record<string, string | number>;
} {
	const bindings = getBindings();
	if (row.template === "welcome" || row.kind === "welcome") {
		const templateId = bindings.RESEND_TEMPLATE_WELCOME_ID?.trim() || "";
		if (!templateId) throw new Error("missing_resend_template_welcome_id");

		const payload = row.payload ?? {};
		return {
			subject: row.subject ?? "Welcome to AI Stats",
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

		return {
			subject: row.subject ?? "Low balance alert",
			templateId,
			variables: {
				USER_FIRST_NAME:
					(typeof payload.user_first_name === "string" && payload.user_first_name.trim()) ||
					"there",
				BALANCE_REMAINING: balanceUsd ?? "",
			},
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
			"id,created_at,kind,template,to_email,subject,team_id,user_id,payload,attempts,last_error,sent_at",
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
			await sendEmail({
				to: row.to_email,
				subject: rendered.subject,
				template: { id: rendered.templateId, variables: rendered.variables },
			});

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

