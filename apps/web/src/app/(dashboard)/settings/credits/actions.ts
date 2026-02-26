"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import { requireActiveTeamStripeCustomer } from "@/lib/server/activeTeamStripe";
import {
    requireAuthenticatedUser,
    requireTeamMembership,
} from "@/utils/serverActionAuth";
import "server-only";

export async function RefreshCredits() {
    revalidatePath("/settings/credits");
}

interface SetUpAutoTopUpProps {
    balanceThreshold: number;
    topUpAmount: number;
    paymentMethodId?: string | null;
}

export async function SetUpAutoTopUp(props: SetUpAutoTopUpProps) {
    const { supabase, user } = await requireAuthenticatedUser();
    // read team id from the shared helper
    const teamId = await getTeamIdFromCookie();
    if (!teamId) throw new Error("Missing team id cookie");
    await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

    const {
        balanceThreshold,
        topUpAmount,
        paymentMethodId = null,
    } = props;
    const minTopUpNanos = 10 * 1_000_000_000;
    if (topUpAmount < minTopUpNanos) {
        throw new Error("Minimum auto top-up amount is $10");
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
        .eq("team_id", teamId)
        .select();

    if (error) throw error;

    revalidatePath("/settings/credits");
    return data;
}

export async function DisableAutoTopUpServer() {
    const { supabase, user } = await requireAuthenticatedUser();
    const teamId = await getTeamIdFromCookie();
    if (!teamId) throw new Error("Missing team id cookie");
    await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

    const { data, error } = await supabase
        .from("wallets")
        .update({
            auto_top_up_enabled: false,
            low_balance_threshold: 0,
            auto_top_up_amount: 0,
            auto_top_up_account_id: null,
            updated_at: new Date().toISOString()
        })
        .eq("team_id", teamId)
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
	const teamId = await getTeamIdFromCookie();
	if (!teamId) throw new Error("Missing team id cookie");
	await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

	if (enabled) {
		if (thresholdUsd == null || !Number.isFinite(thresholdUsd) || thresholdUsd <= 0) {
			throw new Error("Threshold must be greater than $0");
		}
	}

	const thresholdNanos =
		thresholdUsd == null ? 0 : Math.round(thresholdUsd * 1_000_000_000);

	const payload: any = {
		team_id: teamId,
		low_balance_email_enabled: enabled,
		low_balance_email_threshold_nanos: thresholdNanos,
		updated_at: new Date().toISOString(),
	};

	// If disabled, clear threshold (keeps state easy to reason about).
	if (!enabled) {
		payload.low_balance_email_threshold_nanos = 0;
	}

	const { error } = await supabase
		.from("team_settings")
		.upsert(payload, { onConflict: "team_id" });

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
    team_id?: string | null;
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
    const teamId = args.team_id ?? (await getTeamIdFromCookie());
    if (!teamId) throw new Error("Missing team id");
    await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

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
        body: JSON.stringify({ ...args, team_id: teamId }),
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

function clampInt(value: number, min: number, max: number, fallback: number) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

export async function saveBillingOnboardingSettings(args: SaveBillingOnboardingArgs) {
    const { supabase, user } = await requireAuthenticatedUser();
    const teamId = await getTeamIdFromCookie();
    if (!teamId) throw new Error("Missing team id cookie");
    await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

    const { data: teamRow, error: teamErr } = await supabase
        .from("teams")
        .select("tier,billing_mode,invoice_mode_activated_at,invoice_onboarding_status")
        .eq("id", teamId)
        .maybeSingle();
    if (teamErr) throw teamErr;

    const teamTier = String(teamRow?.tier ?? "basic").toLowerCase();
    const currentMode =
        String(teamRow?.billing_mode ?? "wallet").toLowerCase() === "invoice"
            ? "invoice"
            : "wallet";
    const onboardingStatus = String(teamRow?.invoice_onboarding_status ?? "none").toLowerCase();
    const alreadyInvoice = currentMode === "invoice";

    if (teamTier !== "enterprise") {
        throw new Error("Invoiced billing is available for Enterprise teams only.");
    }
    if (!alreadyInvoice && onboardingStatus !== "pre_invoice") {
        throw new Error("This team is not authorized for invoiced billing yet.");
    }

    const { data: existingProfile, error: profileReadErr } = await supabase
        .from("team_invoice_profiles")
        .select("billing_day,payment_terms_days")
        .eq("team_id", teamId)
        .maybeSingle();
    if (profileReadErr) throw profileReadErr;

    const billingDay = clampInt(
        Number(args.billingDay ?? existingProfile?.billing_day ?? 1),
        1,
        28,
        1,
    );
    const requestedPaymentTerms = Number(
        args.paymentTermsDays ?? existingProfile?.payment_terms_days ?? 30
    );
    if (requestedPaymentTerms !== 14 && requestedPaymentTerms !== 30) {
        throw new Error("Payment terms must be Net 14 or Net 30.");
    }
    const paymentTermsDays: 14 | 30 = requestedPaymentTerms === 14 ? 14 : 30;

    const activatingInvoiceNow = !alreadyInvoice;
    const signedByName = String(args.signedByName ?? "").trim();
    if (activatingInvoiceNow) {
        if (!args.termsAccepted) {
            throw new Error("You must accept the invoiced billing terms to continue.");
        }
        if (signedByName.length < 2) {
            throw new Error("A valid signer name is required.");
        }
        if (signedByName.length > 120) {
            throw new Error("Signer name is too long.");
        }
    }

    const nowIso = new Date().toISOString();

    const teamUpdate: Record<string, any> = {
        billing_mode: "invoice",
        invoice_onboarding_status: "completed",
        updated_at: nowIso,
    };

    if (activatingInvoiceNow) {
        teamUpdate.invoice_terms_accepted_at = nowIso;
        teamUpdate.invoice_terms_accepted_by_user_id = user.id;
        teamUpdate.invoice_terms_accepted_by_name = signedByName;
    }

    const { error: modeErr } = await supabase
        .from("teams")
        .update(teamUpdate)
        .eq("id", teamId);
    if (modeErr) throw modeErr;

    const { error: profileWriteErr } = await supabase
        .from("team_invoice_profiles")
        .upsert(
            {
                team_id: teamId,
                enabled: true,
                billing_day: billingDay,
                payment_terms_days: paymentTermsDays,
                updated_at: nowIso,
            },
            { onConflict: "team_id" },
        );
    if (profileWriteErr) throw profileWriteErr;

    try {
        await requireActiveTeamStripeCustomer({ createIfMissing: true });
    } catch (err) {
        console.warn(
            "[billing-onboarding] unable to ensure stripe customer for invoice mode",
            {
                teamId,
                err: String(err),
            },
        );
    }

    revalidatePath("/settings/credits");
    revalidatePath("/settings/credits/onboarding");
    return { ok: true as const, billingMode: "invoice" as const };
}
