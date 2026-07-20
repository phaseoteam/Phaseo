"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import {
	isPromoCodeFormatValid,
	normalizePromoCodeInput,
	resolveRedeemMessage,
} from "@/lib/credits/promoCodes";
import "server-only";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

export async function RefreshCredits() {
    revalidatePath("/settings/credits");
}

async function resolveWorkspaceIdFromActiveCookie(): Promise<string> {
	const resolvedWorkspaceId = await getWorkspaceIdFromCookie();
	console.info("[credits-action] workspace resolution", {
		hasResolvedWorkspaceId: Boolean(resolvedWorkspaceId),
	});
	if (!resolvedWorkspaceId) {
		throw new Error("Missing workspace id");
	}
	return resolvedWorkspaceId;
}

interface SetUpAutoTopUpProps {
    balanceThreshold: number;
    topUpAmount: number;
    paymentMethodId?: string | null;
}

export async function SetUpAutoTopUp(props: SetUpAutoTopUpProps) {
    const context = await getServerAccountContext();
    const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
    if (!context.accessToken) throw new Error("Unauthorized");

    const {
        balanceThreshold,
        topUpAmount,
        paymentMethodId = null,
    } = props;
    const minTopUpNanos = 1 * 1_000_000_000;
    if (topUpAmount < minTopUpNanos) {
        throw new Error("Minimum auto top-up amount is $1");
    }

	const { data } = await fetchAccountWebApi<{ data: unknown[] }>("/api/account/credits/auto-top-up", context.accessToken, { method: "PUT", body: JSON.stringify({ workspaceId, enabled: true, balanceThreshold, topUpAmount, paymentMethodId }) });

    revalidatePath("/settings/credits");
    return data;
}

export async function DisableAutoTopUpServer() {
	const context = await getServerAccountContext();
	const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
	if (!context.accessToken) throw new Error("Unauthorized");
	const { data } = await fetchAccountWebApi<{ data: unknown[] }>("/api/account/credits/auto-top-up", context.accessToken, { method: "PUT", body: JSON.stringify({ workspaceId, enabled: false }) });
    revalidatePath("/settings/credits");
    return data;
}

type SetLowBalanceEmailAlertArgs = {
	enabled: boolean;
	thresholdUsd: number | null;
};

export async function setLowBalanceEmailAlert(args: SetLowBalanceEmailAlertArgs) {
	const { enabled, thresholdUsd } = args;
	const context = await getServerAccountContext();
	const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
	if (!context.accessToken) throw new Error("Unauthorized");

	if (enabled) {
		if (thresholdUsd == null || !Number.isFinite(thresholdUsd) || thresholdUsd <= 0) {
			throw new Error("Threshold must be greater than $0");
		}
	}

	await fetchAccountWebApi("/api/account/credits/low-balance-alert", context.accessToken, { method: "PUT", body: JSON.stringify({ workspaceId, enabled, thresholdUsd }) });

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

export async function ChargeSavedPayment(args: ChargeSavedPaymentArgs) {
	const context = await getServerAccountContext();
	const workspaceId = args.workspace_id ?? context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
	if (!context.accessToken) throw new Error("Unauthorized");
	try {
		const data = await fetchAccountWebApi<any>("/api/account/settings/billing/charge-saved", context.accessToken, { method: "POST", body: JSON.stringify({ ...args, workspace_id: workspaceId }) });
		return { ok: true, status: 200, data };
	} catch (error: any) {
		return { ok: false, status: Number(error?.status ?? 500), data: { error: error?.message ?? "payment_failed" } };
	}
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
	if (!workspaceId || typeof workspaceId !== "string") {
		return {
			ok: false as const,
			status: "team_forbidden",
			message: "You do not have access to that workspace.",
		};
	}

	const normalizedCode = normalizePromoCodeInput(code);
	if (!isPromoCodeFormatValid(normalizedCode)) {
		return {
			ok: false as const,
			status: "invalid_code_format",
			message: "Credit code format is invalid.",
		};
	}

	const context = await getServerAccountContext();
	if (!context.accessToken) return { ok: false as const, status: "error", message: "You must sign in to redeem a credit code." };
	let row: RedeemCreditCodeRow | null = null;
	try {
		row = (await fetchAccountWebApi<{ result: RedeemCreditCodeRow | null }>("/api/account/credits/redeem", context.accessToken, { method: "POST", body: JSON.stringify({ code: normalizedCode, workspaceId }) })).result;
	} catch {
		return { ok: false as const, status: "error", message: "We could not redeem that credit code right now." };
	}
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
