import { createServerFn } from "@tanstack/react-start";
import { serverAction, serverMutation } from "@/lib/serverFn/actionMiddleware";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import {
	isPromoCodeFormatValid,
	normalizePromoCodeInput,
	resolveRedeemMessage,
} from "@/lib/credits/promoCodes";
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

export const ReviewPurchaseLocation = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((args: {
		countryCode: string;
		workspaceId?: string | null;
	}) => args)
	.handler(async ({ data: args }) => {
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
	});

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
    mfaBypassAcknowledged?: boolean;
    mfaBypassPhrase?: string;
}

export const SetUpAutoTopUp = createServerFn({ method: "POST", strict: { output: false } })
	.middleware([serverMutation])
	.validator((props: SetUpAutoTopUpProps) => props)
	.handler(async ({ data: props }) => {
        const context = await getServerAccountContext();
        const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
        if (!context.accessToken) throw new Error("Unauthorized");

        const {
            balanceThreshold,
            topUpAmount,
            paymentMethodId = null,
            mfaBypassAcknowledged = false,
            mfaBypassPhrase = "",
        } = props;
        const minTopUpNanos = 1 * 1_000_000_000;
        if (topUpAmount < minTopUpNanos) {
            throw new Error("Minimum auto top-up amount is $1");
        }

    	const { data } = await fetchAccountWebApi<{ data: unknown[] }>("/api/account/credits/auto-top-up", context.accessToken, { method: "PUT", body: JSON.stringify({ workspaceId, enabled: true, balanceThreshold, topUpAmount, paymentMethodId, mfaBypassAcknowledged, mfaBypassPhrase }) });

        return data;
    });

export const DisableAutoTopUpServer = createServerFn({ method: "POST", strict: { output: false } })
	.middleware([serverMutation])
	.handler(async () => {
		const context = await getServerAccountContext();
		const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
		if (!context.accessToken) throw new Error("Unauthorized");
		const { data } = await fetchAccountWebApi<{ data: unknown[] }>("/api/account/credits/auto-top-up", context.accessToken, { method: "PUT", body: JSON.stringify({ workspaceId, enabled: false }) });
	    return data;
	});

type SetLowBalanceEmailAlertArgs = {
	enabled: boolean;
	thresholdUsd: number | null;
};

export const setLowBalanceEmailAlert = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((args: SetLowBalanceEmailAlertArgs) => args)
	.handler(async ({ data: args }) => {
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

		return { ok: true };
	});

export const setBillingNotificationPreference = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((args: {
		preference: "autoTopUpFailure" | "paymentMethodExpiring" | "modelDeprecationAlerts" | "modelDeprecationAlertsIncludeAdmins";
		enabled: boolean;
	}) => args)
	.handler(async ({ data: args }) => {
		const context = await getServerAccountContext();
		const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
		if (!context.accessToken) throw new Error("Unauthorized");

		await fetchAccountWebApi("/api/account/credits/notification-preferences", context.accessToken, {
			method: "PUT",
			body: JSON.stringify({ workspaceId, [args.preference]: args.enabled }),
		});

		return { ok: true };
	});

/** How spend rules attribute a person's spend to departments: all of them, or the primary one only. */
export const setDepartmentSpendAttribution = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((value: "all" | "primary") => value)
	.handler(async ({ data: value }) => {
		if (value !== "all" && value !== "primary") throw new Error("Invalid department spend attribution");
		const context = await getServerAccountContext();
		const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
		if (!context.accessToken) throw new Error("Unauthorized");

		await fetchAccountWebApi("/api/account/credits/notification-preferences", context.accessToken, {
			method: "PUT",
			body: JSON.stringify({ workspaceId, departmentSpendAttribution: value }),
		});

		return { ok: true };
	});

/** The workspace billing time zone (IANA) for spend rule calendar periods and spend reports. */
export const setBillingTimeZone = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((timeZone: string) => timeZone)
	.handler(async ({ data: timeZone }) => {
		const zone = typeof timeZone === "string" ? timeZone.trim() : "";
		if (!zone || zone.length > 64) throw new Error("Invalid time zone");
		const context = await getServerAccountContext();
		const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
		if (!context.accessToken) throw new Error("Unauthorized");

		await fetchAccountWebApi("/api/account/credits/notification-preferences", context.accessToken, {
			method: "PUT",
			body: JSON.stringify({ workspaceId, billingTimeZone: zone }),
		});

		return { ok: true };
	});

/** Spend report emails: how often they go out and whether admins get them too (owners always do unless they unsubscribe). */
export const setSpendReportSettings = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((settings: { cadence?: import("@/lib/fetchers/internal/settingsTypes").SpendReportCadence; includeAdmins?: boolean }) => settings)
	.handler(async ({ data: settings }) => {
		const body: Record<string, unknown> = {};
		if (settings.cadence !== undefined) {
			if (!["off", "daily", "weekly", "monthly"].includes(settings.cadence)) throw new Error("Invalid spend report cadence");
			body.spendReportCadence = settings.cadence;
		}
		if (settings.includeAdmins !== undefined) {
			if (typeof settings.includeAdmins !== "boolean") throw new Error("Invalid spend report setting");
			body.spendReportIncludeAdmins = settings.includeAdmins;
		}
		if (!Object.keys(body).length) throw new Error("Nothing to update");
		const context = await getServerAccountContext();
		const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
		if (!context.accessToken) throw new Error("Unauthorized");

		await fetchAccountWebApi("/api/account/credits/notification-preferences", context.accessToken, {
			method: "PUT",
			body: JSON.stringify({ workspaceId, ...body }),
		});

		return { ok: true };
	});

export const createNotificationDestination = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((destination: { name: string; type: import("@/lib/fetchers/internal/settingsTypes").NotificationDestination["type"]; target: string }) => destination)
	.handler(async ({ data: destination }) => {
		const context = await getServerAccountContext();
		const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
		if (!context.accessToken) throw new Error("Unauthorized");
		const result = await fetchAccountWebApi<{ destination: import("@/lib/fetchers/internal/settingsTypes").NotificationDestination; signingSecret?: string }>("/api/account/credits/notification-destinations", context.accessToken, {
			method: "POST",
			body: JSON.stringify({ workspaceId, ...destination }),
		});
		// Custom webhooks come back with their signing secret, shown to the user once.
		return { destination: result.destination, signingSecret: result.signingSecret ?? null };
	});

export const rotateNotificationDestinationSecret = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((destinationId: string) => destinationId)
	.handler(async ({ data: destinationId }) => {
		const context = await getServerAccountContext();
		const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
		if (!context.accessToken) throw new Error("Unauthorized");
		try {
			const result = await fetchAccountWebApi<{ signingSecret: string; signingSecretRotatedAt: string | null }>(`/api/account/credits/notification-destinations/${encodeURIComponent(destinationId)}/signing-secret`, context.accessToken, { method: "POST", body: JSON.stringify({ workspaceId }) });
			return { ok: true as const, signingSecret: result.signingSecret, signingSecretRotatedAt: result.signingSecretRotatedAt };
		} catch (error) {
			const message = error instanceof Error ? error.message : "Could not create a signing secret";
			console.error("[notifications] signing secret rotation failed", { destinationId, workspaceId, error: message });
			return { ok: false as const, error: message };
		}
	});

export const deleteNotificationDestination = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((destinationId: string) => destinationId)
	.handler(async ({ data: destinationId }) => {
		const context = await getServerAccountContext();
		const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
		if (!context.accessToken) throw new Error("Unauthorized");
		await fetchAccountWebApi(`/api/account/credits/notification-destinations/${encodeURIComponent(destinationId)}`, context.accessToken, { method: "DELETE", body: JSON.stringify({ workspaceId }) });
		return { ok: true };
	});

export const setNotificationRoute = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { eventKind: import("@/lib/fetchers/internal/settingsTypes").NotificationEventKind; destinationIds: string[] }) => input)
	.handler(async ({ data: { eventKind, destinationIds } }) => {
		const context = await getServerAccountContext();
		const workspaceId = context.workspaceId ?? await resolveWorkspaceIdFromActiveCookie();
		if (!context.accessToken) throw new Error("Unauthorized");
		await fetchAccountWebApi(`/api/account/credits/notification-routes/${eventKind}`, context.accessToken, { method: "PUT", body: JSON.stringify({ workspaceId, destinationIds }) });
		return { ok: true };
	});

export const testNotificationDestination = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: { destinationId: string; kind?: "notification_test" | "model_deprecation" }) => input)
	.handler(async ({ data: { destinationId, kind = "notification_test" } }) => {
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
	});

export const testNotificationConfiguration = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((configuration: { type: import("@/lib/fetchers/internal/settingsTypes").NotificationDestination["type"]; target: string; kind?: "notification_test" | "model_deprecation" }) => configuration)
	.handler(async ({ data: configuration }) => {
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
	});

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
		process.env.PUBLIC_APP_URL ||
		(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

	return (envUrl || "http://localhost:3000").replace(/\/$/, "");
}

const INTERNAL_HEADER = "x-internal-payments-token";

export const ChargeSavedPayment = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((args: ChargeSavedPaymentArgs) => args)
	.handler(async ({ data: args }) => {
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
	});

type SaveBillingOnboardingArgs = {
    billingDay?: number | null;
    paymentTermsDays?: number | null;
    termsAccepted?: boolean;
    signedByName?: string | null;
};

export const saveBillingOnboardingSettings = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((args: SaveBillingOnboardingArgs) => args)
	.handler(async ({ data: args }) => {
        void args;
        throw new Error("Invoicing is coming soon.");
    });

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

export const redeemCreditCodeAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((args: RedeemCreditCodeArgs) => args)
	.handler(async ({ data: args }) => {
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
	});
