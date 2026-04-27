import { getBindings, getSupabaseAdmin } from "@/runtime/env";

type LowBalanceSettings = {
	enabled: boolean;
	thresholdNanos: number;
	lastSentAt: string | null;
	lastSentBalanceNanos: number | string | null;
};

const RESEND_LOW_BALANCE_EVENT_NAME = "workspace.low_balance";

function deriveFirstNameFromMetadata(metadata: Record<string, unknown> | null | undefined): string {
	if (!metadata) return "";
	const candidates = [
		metadata.first_name,
		metadata.given_name,
		metadata.full_name,
		metadata.name,
	];
	for (const candidate of candidates) {
		const normalized = String(candidate ?? "").trim();
		if (!normalized) continue;
		return normalized.split(/\s+/)[0] ?? "";
	}
	return "";
}

function isResendOnboardingAutomationsEnabled(): boolean {
	const bindings = getBindings();
	const apiKey = String(bindings.RESEND_API_KEY ?? "").trim();
	if (!apiKey) return false;
	const raw = String(bindings.RESEND_ONBOARDING_AUTOMATIONS_ENABLED ?? "")
		.trim()
		.toLowerCase();
	if (!raw) return true;
	return ["1", "true", "yes", "on"].includes(raw);
}

async function sendLowBalanceAutomationEvent(args: {
	email: string;
	firstName: string;
	workspaceId: string;
	workspaceName: string;
	balanceNanos: number;
	balanceUsd: number;
	thresholdNanos: number;
	thresholdUsd: number;
}): Promise<void> {
	const bindings = getBindings();
	const apiKey = String(bindings.RESEND_API_KEY ?? "").trim();
	if (!apiKey) {
		throw new Error("missing_resend_api_key");
	}

	const payload = {
		firstName: args.firstName || "there",
		workspaceId: args.workspaceId,
		workspaceName: args.workspaceName,
		balanceNanos: args.balanceNanos,
		balanceUsd: args.balanceUsd,
		thresholdNanos: args.thresholdNanos,
		thresholdUsd: args.thresholdUsd,
		triggeredAtIso: new Date().toISOString(),
	};

	let attempt = 0;
	while (attempt < 3) {
		attempt += 1;
		const response = await fetch("https://api.resend.com/events", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				event: RESEND_LOW_BALANCE_EVENT_NAME,
				email: args.email,
				payload,
			}),
		});

		if (response.ok) return;
		if (response.status === 429 && attempt < 3) {
			await new Promise((resolve) => {
				setTimeout(resolve, attempt * 300);
			});
			continue;
		}

		let detail = "";
		try {
			detail = await response.text();
		} catch {
			detail = "";
		}
		throw new Error(
			`resend_event_error:${response.status}:${detail || response.statusText || "unknown"}`,
		);
	}
}

export async function enqueueLowBalanceEmail(args: {
	workspaceId: string;
	balanceNanos: number;
	settings: LowBalanceSettings;
}): Promise<void> {
	const { workspaceId, balanceNanos, settings } = args;
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
		.from("workspaces")
		.select("id,name,owner_user_id")
		.eq("id", workspaceId)
		.maybeSingle();

	const teamName = (teamRow as any)?.name ?? "your team";
	const ownerUserId = (teamRow as any)?.owner_user_id ?? null;
	if (!ownerUserId) return;

	let ownerEmail: string | null = null;
	let ownerMetadata: Record<string, unknown> | null = null;
	try {
		const userRes = await (supabase as any).auth.admin.getUserById(ownerUserId);
		ownerEmail = userRes?.data?.user?.email ?? null;
		ownerMetadata = (userRes?.data?.user?.user_metadata ?? null) as
			| Record<string, unknown>
			| null;
	} catch {
		ownerEmail = null;
		ownerMetadata = null;
	}
	if (!ownerEmail) return;

	const balanceUsd = Math.max(0, balanceNanos) / 1_000_000_000;
	const thresholdUsd = settings.thresholdNanos / 1_000_000_000;

	const ownerFirstName = deriveFirstNameFromMetadata(ownerMetadata) || "there";
	const roundedBalanceUsd = Number(balanceUsd.toFixed(2));
	const roundedThresholdUsd = Number(thresholdUsd.toFixed(2));

	if (isResendOnboardingAutomationsEnabled()) {
		await sendLowBalanceAutomationEvent({
			email: ownerEmail,
			firstName: ownerFirstName,
			workspaceId,
			workspaceName: teamName,
			balanceNanos,
			balanceUsd: roundedBalanceUsd,
			thresholdNanos: settings.thresholdNanos,
			thresholdUsd: roundedThresholdUsd,
		});
	} else {
		await supabase.from("email_outbox").insert({
			kind: "low_balance",
			template: "low_balance",
			to_email: ownerEmail,
			subject: "Low balance alert",
			workspace_id: workspaceId,
			user_id: ownerUserId,
			payload: {
				user_first_name: ownerFirstName,
				workspace_id: workspaceId,
				team_name: teamName,
				balance_nanos: balanceNanos,
				balance_usd: roundedBalanceUsd,
				threshold_nanos: settings.thresholdNanos,
				threshold_usd: roundedThresholdUsd,
			},
		} as any);
	}

	await supabase
		.from("workspace_settings")
		.update({
			low_balance_email_last_sent_at: new Date().toISOString(),
			low_balance_email_last_sent_balance_nanos: balanceNanos,
			updated_at: new Date().toISOString(),
		})
		.eq("workspace_id", workspaceId);
}
