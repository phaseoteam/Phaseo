import { getSupabaseAdmin } from "@/runtime/env";

type LowBalanceSettings = {
	enabled: boolean;
	thresholdNanos: number;
	lastSentAt: string | null;
	lastSentBalanceNanos: number | string | null;
};

export async function enqueueLowBalanceEmail(args: {
	teamId: string;
	balanceNanos: number;
	settings: LowBalanceSettings;
}): Promise<void> {
	const { teamId, balanceNanos, settings } = args;
	if (!settings.enabled) return;
	if (!Number.isFinite(settings.thresholdNanos) || settings.thresholdNanos <= 0) {
		return;
	}
	if (!Number.isFinite(balanceNanos)) return;
	if (balanceNanos >= settings.thresholdNanos) return;

	// Cooldown: avoid email spam.
	const now = Date.now();
	const lastSentAtMs = settings.lastSentAt ? Date.parse(settings.lastSentAt) : NaN;
	const withinCooldown =
		Number.isFinite(lastSentAtMs) && now - lastSentAtMs < 6 * 60 * 60 * 1000;
	const lastSentBalanceNanos =
		typeof settings.lastSentBalanceNanos === "string"
			? Number(settings.lastSentBalanceNanos)
			: settings.lastSentBalanceNanos;
	const wasPreviouslyAbove =
		typeof lastSentBalanceNanos === "number" &&
		Number.isFinite(lastSentBalanceNanos) &&
		lastSentBalanceNanos >= settings.thresholdNanos;
	if (withinCooldown && !wasPreviouslyAbove) {
		return;
	}

	const supabase = getSupabaseAdmin();

	// Resolve team name + owner email.
	const { data: teamRow } = await supabase
		.from("teams")
		.select("id,name,owner_user_id")
		.eq("id", teamId)
		.maybeSingle();

	const teamName = (teamRow as any)?.name ?? "your team";
	const ownerUserId = (teamRow as any)?.owner_user_id ?? null;
	if (!ownerUserId) return;

	let ownerEmail: string | null = null;
	try {
		const userRes = await (supabase as any).auth.admin.getUserById(ownerUserId);
		ownerEmail = userRes?.data?.user?.email ?? null;
	} catch {
		ownerEmail = null;
	}
	if (!ownerEmail) return;

	const balanceUsd = Math.max(0, balanceNanos) / 1_000_000_000;
	const thresholdUsd = settings.thresholdNanos / 1_000_000_000;

	await supabase.from("email_outbox").insert({
		kind: "low_balance",
		template: "low_balance",
		to_email: ownerEmail,
		subject: "Low balance alert",
		team_id: teamId,
		user_id: ownerUserId,
		payload: {
			team_id: teamId,
			team_name: teamName,
			balance_nanos: balanceNanos,
			balance_usd: Number(balanceUsd.toFixed(2)),
			threshold_nanos: settings.thresholdNanos,
			threshold_usd: Number(thresholdUsd.toFixed(2)),
		},
	} as any);

	await supabase
		.from("team_settings")
		.update({
			low_balance_email_last_sent_at: new Date().toISOString(),
			low_balance_email_last_sent_balance_nanos: balanceNanos,
			updated_at: new Date().toISOString(),
		})
		.eq("team_id", teamId);
}
