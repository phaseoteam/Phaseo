"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
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
    const supabase = await createClient();
    // read team id from the shared helper
    const teamId = await getTeamIdFromCookie();
    if (!teamId) throw new Error("Missing team id cookie");

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
    const supabase = await createClient();
    const teamId = await getTeamIdFromCookie();
    if (!teamId) throw new Error("Missing team id cookie");

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
        body: JSON.stringify(args),
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
