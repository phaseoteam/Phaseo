"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import {
	isPromoCodeFormatValid,
	normalizePromoCodeInput,
	resolveRedeemMessage,
} from "@/lib/credits/promoCodes";
import "server-only";
import { fetchAccountWebApi, fetchPublicWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import {
	requireAuthenticatedUser,
	requireWorkspaceMembership,
} from "@/utils/serverActionAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import { normaliseCountryCode } from "@/lib/countryCodes";
import { getStripe } from "@/lib/stripe";
import { requireActiveTeamStripeCustomer } from "@/lib/server/activeTeamStripe";
import { isValidTopUpAmountPence, TOP_UP_CURRENCY } from "@/lib/server/topUpValidation";

type PurchaseLocationPreview = {
	countryCode: string;
	restrictedModels: Array<{ id: string; name: string; logoId: string | null; organisationName: string }>;
	regionRestrictedModels: Array<{ id: string; name: string; logoId: string | null; organisationName: string }>;
};

export async function RefreshCredits() {
    revalidatePath("/settings/credits");
}

export async function ReviewPurchaseLocation(args: {
	countryCode: string;
	workspaceId?: string | null;
}) {
	const countryCode = normaliseCountryCode(args.countryCode);
	if (!countryCode) throw new Error("Select a valid country or region");
	const { supabase, user } = await requireAuthenticatedUser();
	const workspaceId = args.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
	await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);

	const admin = createAdminClient();
	const confirmedAt = new Date().toISOString();
	const countryUpdate = await admin
		.from("users")
		.update({ declared_country_code: countryCode, country_declared_at: confirmedAt })
		.eq("user_id", user.id);
	if (countryUpdate.error) throw new Error("Could not save your country");

	const preview = await fetchPublicWebApi<PurchaseLocationPreview>(
		`/api/_web/credits/model-availability?country=${encodeURIComponent(countryCode)}`,
	);

	return {
		confirmedAt,
		workspaceId,
		...preview,
	};
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
		if (thresholdUsd == null || !Number.isFinite(thresholdUsd) || thresholdUsd < 0) {
			throw new Error("Threshold cannot be negative");
		}
	}

	await fetchAccountWebApi("/api/account/credits/low-balance-alert", context.accessToken, { method: "PUT", body: JSON.stringify({ workspaceId, enabled, thresholdUsd }) });

	revalidatePath("/settings/credits");
	revalidatePath("/settings/notifications");
	return { ok: true };
}

export async function setBillingNotificationPreference(args: {
	preference: "autoTopUpFailure" | "paymentMethodExpiring" | "modelDeprecationAlerts";
	enabled: boolean;
}) {
	const context = await getServerAccountContext();
	const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
	if (!context.accessToken) throw new Error("Unauthorized");

	await fetchAccountWebApi("/api/account/credits/notification-preferences", context.accessToken, {
		method: "PUT",
		body: JSON.stringify({ workspaceId, [args.preference]: args.enabled }),
	});

	revalidatePath("/settings/credits");
	revalidatePath("/settings/notifications");
	return { ok: true };
}

export async function createNotificationDestination(destination: { name: string; type: import("@/lib/fetchers/internal/settingsTypes").NotificationDestination["type"]; target: string }) {
	const context = await getServerAccountContext();
	const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
	if (!context.accessToken) throw new Error("Unauthorized");
	const result = await fetchAccountWebApi<{ destination: import("@/lib/fetchers/internal/settingsTypes").NotificationDestination }>("/api/account/credits/notification-destinations", context.accessToken, {
		method: "POST",
		body: JSON.stringify({ workspaceId, ...destination }),
	});
	revalidatePath("/settings/notifications");
	return result.destination;
}

export async function deleteNotificationDestination(destinationId: string) {
	const context = await getServerAccountContext();
	const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
	if (!context.accessToken) throw new Error("Unauthorized");
	await fetchAccountWebApi(`/api/account/credits/notification-destinations/${encodeURIComponent(destinationId)}`, context.accessToken, { method: "DELETE", body: JSON.stringify({ workspaceId }) });
	revalidatePath("/settings/notifications");
	return { ok: true };
}

export async function setNotificationRoute(eventKind: import("@/lib/fetchers/internal/settingsTypes").NotificationEventKind, destinationIds: string[]) {
	const context = await getServerAccountContext();
	const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
	if (!context.accessToken) throw new Error("Unauthorized");
	await fetchAccountWebApi(`/api/account/credits/notification-routes/${eventKind}`, context.accessToken, { method: "PUT", body: JSON.stringify({ workspaceId, destinationIds }) });
	revalidatePath("/settings/notifications");
	return { ok: true };
}

export async function testNotificationDestination(destinationId: string, kind: "notification_test" | "model_deprecation" = "notification_test") {
	const context = await getServerAccountContext();
	const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
	if (!context.accessToken) throw new Error("Unauthorized");
	try {
		const result = await fetchAccountWebApi<{ ok: boolean; status?: number }>(`/api/account/credits/notification-destinations/${encodeURIComponent(destinationId)}/test`, context.accessToken, { method: "POST", body: JSON.stringify({ workspaceId, kind }) });
		return { ok: true as const, status: result.status };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not send test notification";
		console.error("[notifications] saved destination test failed", { destinationId, workspaceId, error: message });
		return { ok: false as const, error: message };
	}
}

export async function testNotificationConfiguration(configuration: { type: import("@/lib/fetchers/internal/settingsTypes").NotificationDestination["type"]; target: string; kind?: "notification_test" | "model_deprecation" }) {
	const context = await getServerAccountContext();
	const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
	if (!context.accessToken) throw new Error("Unauthorized");
	try {
		const result = await fetchAccountWebApi<{ ok: boolean; status?: number }>("/api/account/credits/notification-destinations/test", context.accessToken, { method: "POST", body: JSON.stringify({ workspaceId, ...configuration }) });
		return { ok: true as const, status: result.status };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not send test notification";
		console.error("[notifications] configuration test failed", { type: configuration.type, workspaceId, error: message });
		return { ok: false as const, error: message };
	}
}

type ChargeSavedPaymentArgs = {
    amount_pence: number;
    event_type?: string;
    paymentMethodId?: string | null;
	payment_method_id?: string | null;
	workspace_id?: string | null;
	country_code: string;
};

function resolveInternalBaseUrl(): string {
	const envUrl =
		process.env.INTERNAL_APP_URL ||
		process.env.APP_URL ||
		process.env.WEBSITE_URL ||
		process.env.NEXT_PUBLIC_APP_URL ||
		(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

	return (envUrl || "http://localhost:3000").replace(/\/$/, "");
}

const INTERNAL_HEADER = "x-internal-payments-token";

export async function ChargeSavedPayment(args: ChargeSavedPaymentArgs) {
	const { supabase, user } = await requireAuthenticatedUser();
	const workspaceId = args.workspace_id ?? (await resolveWorkspaceIdFromActiveCookie());
	await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);
	if (!isValidTopUpAmountPence(args.amount_pence)) throw new Error("Invalid top-up amount");
	const { customerId } = await requireActiveTeamStripeCustomer({
		workspaceId,
		roles: ["owner", "admin"],
	});
	const paymentMethodId = args.paymentMethodId ?? args.payment_method_id ?? null;
	if (paymentMethodId) {
		const paymentMethod = await getStripe().paymentMethods.retrieve(paymentMethodId);
		const boundCustomerId = typeof paymentMethod.customer === "string"
			? paymentMethod.customer
			: paymentMethod.customer?.id;
		if (boundCustomerId !== customerId) throw new Error("Payment method does not belong to this workspace");
	}
	const countryCode = normaliseCountryCode(args.country_code);
	if (!countryCode) throw new Error("Country is required before purchasing credits");
	const { error: countryError } = await createAdminClient()
		.from("users")
		.update({ declared_country_code: countryCode, country_declared_at: new Date().toISOString() })
		.eq("user_id", user.id);
	if (countryError) throw new Error("Could not confirm purchase location");

	const token = process.env.INTERNAL_PAYMENTS_TOKEN ?? process.env.INTERNAL_API_TOKEN;
	if (!token) throw new Error("Internal payments token not configured");

	const response = await fetch(`${resolveInternalBaseUrl()}/api/payments/charge-saved`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			[INTERNAL_HEADER]: token,
		},
		body: JSON.stringify({
			amount_pence: args.amount_pence,
			currency: TOP_UP_CURRENCY,
			event_type: args.event_type,
			payment_method_id: paymentMethodId,
			customerId,
			country_code: countryCode,
			workspace_id: workspaceId,
		}),
		cache: "no-store",
	});

	const data = await response.json().catch(() => ({ error: "invalid_response" }));
	return { ok: response.ok, status: response.status, data };
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
