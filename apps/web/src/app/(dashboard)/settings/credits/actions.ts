"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { getActiveWorkspaceIdFromCookieRaw } from "@/utils/workspaceCookie";
import {
    requireAuthenticatedUser,
    requireWorkspaceMembership,
} from "@/utils/serverActionAuth";
import {
	isPromoCodeFormatValid,
	normalizePromoCodeInput,
	resolveRedeemMessage,
} from "@/lib/credits/promoCodes";
import "server-only";

export async function RefreshCredits() {
    revalidatePath("/settings/credits");
}

async function resolveWorkspaceIdFromActiveCookie(userId: string): Promise<string> {
    const workspaceId = await getActiveWorkspaceIdFromCookieRaw();
    console.info("[credits-action] active workspace cookie", {
        userId,
        workspaceId: workspaceId ?? null,
    });
    if (!workspaceId) {
        throw new Error("Missing workspace id cookie");
    }
    return workspaceId;
}

interface SetUpAutoTopUpProps {
    balanceThreshold: number;
    topUpAmount: number;
    paymentMethodId?: string | null;
}

export async function SetUpAutoTopUp(props: SetUpAutoTopUpProps) {
    const { supabase, user } = await requireAuthenticatedUser();
    const workspaceId = await resolveWorkspaceIdFromActiveCookie(user.id);
    await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);

    const {
        balanceThreshold,
        topUpAmount,
        paymentMethodId = null,
    } = props;
    const minTopUpNanos = 1 * 1_000_000_000;
    if (topUpAmount < minTopUpNanos) {
        throw new Error("Minimum auto top-up amount is $1");
    }

    // store amounts as integers (assume nanos passed in already)
    const payload = {
        auto_top_up_enabled: true,
        low_balance_threshold: balanceThreshold ?? 0,
        auto_top_up_amount: topUpAmount ?? 0,
        auto_top_up_account_id: paymentMethodId,
        updated_at: new Date().toISOString(),
    };

    // upsert ensures wallet row exists for team
    const { data, error } = await supabase
        .from("wallets")
        .update(payload)
        .eq("workspace_id", workspaceId)
        .select();

    if (error) throw error;

    revalidatePath("/settings/credits");
    return data;
}

export async function DisableAutoTopUpServer() {
    const { supabase, user } = await requireAuthenticatedUser();
    const workspaceId = await resolveWorkspaceIdFromActiveCookie(user.id);
    await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);

    const { data, error } = await supabase
        .from("wallets")
        .update({
            auto_top_up_enabled: false,
            low_balance_threshold: 0,
            auto_top_up_amount: 0,
            auto_top_up_account_id: null,
            updated_at: new Date().toISOString()
        })
        .eq("workspace_id", workspaceId)
        .select();

    if (error) throw error;
    revalidatePath("/settings/credits");
    return data;
}

type SetLowBalanceEmailAlertArgs = {
	enabled: boolean;
	thresholdUsd: number | null;
};

export async function setLowBalanceEmailAlert(args: SetLowBalanceEmailAlertArgs) {
	const { enabled, thresholdUsd } = args;
	const { supabase, user } = await requireAuthenticatedUser();
	const workspaceId = await resolveWorkspaceIdFromActiveCookie(user.id);
	await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);

	if (enabled) {
		if (thresholdUsd == null || !Number.isFinite(thresholdUsd) || thresholdUsd <= 0) {
			throw new Error("Threshold must be greater than $0");
		}
	}

	const thresholdNanos =
		thresholdUsd == null ? 0 : Math.round(thresholdUsd * 1_000_000_000);

	const payload: any = {
		workspace_id: workspaceId,
		low_balance_email_enabled: enabled,
		low_balance_email_threshold_nanos: thresholdNanos,
		updated_at: new Date().toISOString(),
	};

	// If disabled, clear threshold (keeps state easy to reason about).
	if (!enabled) {
		payload.low_balance_email_threshold_nanos = 0;
	}

	const { error } = await supabase
		.from("workspace_settings")
		.upsert(payload, { onConflict: "workspace_id" });

	if (error) throw error;

	revalidatePath("/settings/credits");
	return { ok: true };
}

type ChargeSavedPaymentArgs = {
    customerId: string;
    amount_pence: number;
    currency?: string;
    event_type?: string;
    paymentMethodId?: string | null;
    payment_method_id?: string | null;
    workspace_id?: string | null;
};

function resolveInternalBaseUrl(): string {
    const envUrl =
        process.env.INTERNAL_APP_URL ||
        process.env.APP_URL ||
        process.env.WEBSITE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

    if (!envUrl) {
        return "http://localhost:3000";
    }
    return envUrl.replace(/\/$/, "");
}

const INTERNAL_HEADER = "x-internal-payments-token";

export async function ChargeSavedPayment(args: ChargeSavedPaymentArgs) {
    const { supabase, user } = await requireAuthenticatedUser();
    const workspaceId = args.workspace_id ?? (await resolveWorkspaceIdFromActiveCookie(user.id));
    await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);

    const token = process.env.INTERNAL_PAYMENTS_TOKEN ?? process.env.INTERNAL_API_TOKEN;
    if (!token) throw new Error("Internal payments token not configured");

    const baseUrl = resolveInternalBaseUrl();
    const target = `${baseUrl}/api/payments/charge-saved`;

    const res = await fetch(target, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            [INTERNAL_HEADER]: token,
        },
        body: JSON.stringify({ ...args, workspace_id: workspaceId }),
        cache: "no-store",
    });

    let data: any = null;
    try {
        data = await res.json();
    } catch {
        data = { error: "invalid_response" };
    }

    return { ok: res.ok, status: res.status, data };
}

type SaveBillingOnboardingArgs = {
    billingDay?: number | null;
    paymentTermsDays?: number | null;
    termsAccepted?: boolean;
    signedByName?: string | null;
};

export async function saveBillingOnboardingSettings(args: SaveBillingOnboardingArgs) {
    void args;
    throw new Error("Invoicing is coming soon.");
}

type RedeemCreditCodeArgs = {
	code: string;
	workspaceId: string;
};

type RedeemCreditCodeRow = {
	status?: string | null;
	message?: string | null;
	grant_id?: string | null;
	amount_nanos?: number | null;
	before_balance_nanos?: number | null;
	after_balance_nanos?: number | null;
	workspace_id?: string | null;
};

export async function redeemCreditCodeAction(args: RedeemCreditCodeArgs) {
	const { code, workspaceId } = args;
	const { supabase, user } = await requireAuthenticatedUser();

	if (!workspaceId || typeof workspaceId !== "string") {
		return {
			ok: false as const,
			status: "team_forbidden",
			message: "You do not have access to that workspace.",
		};
	}

	await requireWorkspaceMembership(supabase, user.id, workspaceId);

	const normalizedCode = normalizePromoCodeInput(code);
	if (!isPromoCodeFormatValid(normalizedCode)) {
		return {
			ok: false as const,
			status: "invalid_code_format",
			message: "Credit code format is invalid.",
		};
	}

	const { data, error } = await supabase.rpc("redeem_credit_code", {
		p_code: normalizedCode,
		p_workspace_id: workspaceId,
	});

	if (error) {
		console.warn("[credits.redeem] redeem_credit_code rpc failed", {
			code: error.code ?? null,
			message: error.message ?? null,
			workspaceId,
			userId: user.id,
		});
		return {
			ok: false as const,
			status: "error",
			message: "We could not redeem that credit code right now.",
		};
	}

	const row = (Array.isArray(data) ? data[0] : data) as RedeemCreditCodeRow | null;
	const status = String(row?.status ?? "error").toLowerCase();
	const message = resolveRedeemMessage(status, row?.message);

	const amountNanos = Number(row?.amount_nanos ?? NaN);
	const beforeBalanceNanos = Number(row?.before_balance_nanos ?? NaN);
	const afterBalanceNanos = Number(row?.after_balance_nanos ?? NaN);
	const resolvedTeamId = String(row?.workspace_id ?? workspaceId);

	const ok = status === "succeeded";
	if (ok) {
		revalidatePath("/settings/credits");
		revalidatePath("/settings/credits/transactions");
	}

	return {
		ok,
		status,
		message,
		amountNanos: Number.isFinite(amountNanos) ? amountNanos : null,
		beforeBalanceNanos: Number.isFinite(beforeBalanceNanos)
			? beforeBalanceNanos
			: null,
		afterBalanceNanos: Number.isFinite(afterBalanceNanos)
			? afterBalanceNanos
			: null,
		workspaceId: resolvedTeamId,
		grantId: row?.grant_id ?? null,
	};
}
