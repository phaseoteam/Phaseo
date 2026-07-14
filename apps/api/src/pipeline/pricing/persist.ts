import Stripe from "stripe";
// Purpose: Pricing rules, billing, and persistence helpers.
// Why: Centralizes all cost calculations.
// How: Persists pricing/usage data into storage.

import { getSupabaseAdmin, ensureRuntimeForBackground } from "../../runtime/env";
import { enqueueLowBalanceEmail } from "../notifications/low-balance";

export type ChargeRpcResult = {
    status: string;
    auto_top_up_amount_nanos: number;
    auto_top_up_account_id: string | null;
    stripe_customer_id: string | null;
    applied?: boolean;
    already_applied?: boolean;
};

type WorkspaceLowBalanceSettingsRow = {
    low_balance_email_enabled: boolean | null;
    low_balance_email_threshold_nanos: number | string | null;
    low_balance_email_last_sent_at: string | null;
    low_balance_email_last_sent_balance_nanos: number | string | null;
};

let workspaceSettingsSupportsLowBalanceEmailColumns: boolean | null = null;

function getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY ?? process.env.TEST_STRIPE_SECRET_KEY;
    if (!key) throw new Error("Stripe secret key missing");
    return new Stripe(key, { apiVersion: "2026-04-22.dahlia" as any });
}

async function resolveDefaultPaymentMethod(stripe: Stripe, customerId: string): Promise<string | null> {
    if (!customerId) return null;
    const customer = (await stripe.customers.retrieve(customerId)) as any;
    if (typeof customer === "string") return null;
    const invoiceDefault = customer.invoice_settings?.default_payment_method;
    if (typeof invoiceDefault === "string") return invoiceDefault;
    const legacyDefault = customer.default_source;
    if (typeof legacyDefault === "string") return legacyDefault;
    const methods = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 1,
    });
    return methods.data?.[0]?.id ?? null;
}

function normalizeChargeRpcResult(data: any): ChargeRpcResult | null {
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") return null;
    const amountRaw = Number((row as any).auto_top_up_amount_nanos ?? 0);
    return {
        status: String((row as any).status ?? "unknown"),
        auto_top_up_amount_nanos: Number.isFinite(amountRaw) ? amountRaw : 0,
        auto_top_up_account_id:
            typeof (row as any).auto_top_up_account_id === "string"
                ? (row as any).auto_top_up_account_id
                : null,
        stripe_customer_id:
            typeof (row as any).stripe_customer_id === "string"
                ? (row as any).stripe_customer_id
                : null,
        applied: (row as any).applied === true,
        already_applied: (row as any).already_applied === true,
    };
}

function buildAutoTopUpIdempotencyKey(args: { workspaceId: string; requestId: string }): string {
    const normalizedTeamId = args.workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const normalizedRequestId = args.requestId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `auto_top_up:${normalizedTeamId}:${normalizedRequestId}`.slice(0, 255);
}

function toFiniteNumber(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function isMissingColumnError(error: unknown, column: string, table?: string): boolean {
    const candidate = error && typeof error === "object" ? error as Record<string, unknown> : null;
    const code = String(candidate?.code ?? "");
    const message = String(candidate?.message ?? "");
    if (code !== "PGRST204" && code !== "42703") return false;
    if (!message.toLowerCase().includes(column.toLowerCase())) return false;
    if (!table) return true;
    return message.toLowerCase().includes(table.toLowerCase());
}

async function loadWorkspaceLowBalanceSettings(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    workspaceId: string,
): Promise<WorkspaceLowBalanceSettingsRow | null> {
    const selectLegacyCompatible = async () => {
        const { data, error } = await supabase
            .from("workspace_settings")
            .select(
                "low_balance_email_enabled,low_balance_email_threshold_nanos,low_balance_email_last_sent_at,low_balance_email_last_sent_balance_nanos",
            )
            .eq("workspace_id", workspaceId)
            .maybeSingle();
        return { data, error };
    };

    if (workspaceSettingsSupportsLowBalanceEmailColumns === false) {
        return null;
    }

    const { data, error } = await selectLegacyCompatible();
    if (!error) {
        workspaceSettingsSupportsLowBalanceEmailColumns = true;
        return (data ?? null) as WorkspaceLowBalanceSettingsRow | null;
    }

    if (isMissingColumnError(error, "low_balance_email_enabled", "workspace_settings")) {
        workspaceSettingsSupportsLowBalanceEmailColumns = false;
        return null;
    }

    console.error("[low-balance] failed to load workspace settings", {
        workspaceId,
        code: error.code ?? null,
        message: error.message ?? String(error),
    });
    return null;
}

async function maybeEnqueueLowBalanceAlert(workspaceId: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const typedSettings = await loadWorkspaceLowBalanceSettings(supabase, workspaceId);
    if (!typedSettings?.low_balance_email_enabled) return;

    const thresholdNanos = toFiniteNumber(typedSettings.low_balance_email_threshold_nanos, 0);
    if (thresholdNanos <= 0) return;

    const { data: walletRow, error: walletError } = await supabase
        .from("wallets")
        .select("balance_nanos")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

    if (walletError) {
        console.error("[low-balance] failed to load wallet balance", {
            workspaceId,
            code: walletError.code ?? null,
            message: walletError.message ?? String(walletError),
        });
        return;
    }

    const balanceNanos = toFiniteNumber((walletRow as any)?.balance_nanos, NaN);
    if (!Number.isFinite(balanceNanos)) return;

    await enqueueLowBalanceEmail({
        workspaceId,
        balanceNanos,
        settings: {
            enabled: true,
            thresholdNanos,
            lastSentAt: typedSettings.low_balance_email_last_sent_at ?? null,
            lastSentBalanceNanos: typedSettings.low_balance_email_last_sent_balance_nanos ?? null,
        },
    });
}

// src/lib/gateway/pricing/persist.ts
export async function recordUsageAndCharge(args: {
    requestId: string;
    workspaceId: string;
    cost_nanos: number;
}): Promise<ChargeRpcResult> {
    const releaseRuntime = ensureRuntimeForBackground();
    try {
        const supabase = getSupabaseAdmin();
        // Invoicing is intentionally disabled right now; all charges must flow through
        // the idempotent gateway_deduct_and_check_top_up_once RPC.
        const onceRpc = await supabase.rpc("gateway_deduct_and_check_top_up_once", {
            p_workspace_id: args.workspaceId,
            p_request_id: args.requestId,
            p_cost_nanos: args.cost_nanos,
        });
        if (onceRpc.error) throw onceRpc.error;
        const chargeResult = normalizeChargeRpcResult(onceRpc.data);

        if (!chargeResult) throw new Error("gateway_charge_result_missing");
        if (!chargeResult.applied && !chargeResult.already_applied) {
            throw new Error(`gateway_charge_not_applied:${chargeResult.status || "unknown"}`);
        }
        if (chargeResult.already_applied) return chargeResult;

        try {
            await maybeEnqueueLowBalanceAlert(args.workspaceId);
        } catch (lowBalanceError) {
            console.error("[low-balance] enqueue failed", {
                workspaceId: args.workspaceId,
                error: lowBalanceError instanceof Error ? lowBalanceError.message : String(lowBalanceError),
            });
        }

        if (chargeResult.status === "top_up_required") {
            // Trigger auto-recharge
            // NOTE: The amount charged is the raw auto_top_up_amount
            // The Stripe webhook will:
            // 1. Apply reverse calculation: net = gross / (1 + fee_rate)
            // 2. Use the flat 5% top-up fee
            // 3. Credit wallet with net amount after the fee deduction
            const stripe = getStripe();
            const minTopUpNanos = 1 * 1_000_000_000;
            if (chargeResult.auto_top_up_amount_nanos < minTopUpNanos) {
                console.error("[auto-recharge] Skipped: auto top-up amount below $1", {
                    workspaceId: args.workspaceId,
                    amount_nanos: chargeResult.auto_top_up_amount_nanos,
                });
                return chargeResult;
            }
            const amount_cents = Math.round(chargeResult.auto_top_up_amount_nanos / 10_000_000); // since 1 cent = 10,000,000 nanos
            const paymentMethod =
                chargeResult.auto_top_up_account_id ??
                (chargeResult.stripe_customer_id
                    ? await resolveDefaultPaymentMethod(stripe, chargeResult.stripe_customer_id)
                    : null);
            if (!paymentMethod) {
                console.error("[auto-recharge] Skipped: no payment method available", {
                    workspaceId: args.workspaceId,
                });
                return chargeResult;
            }

            const topUpMetadata: Record<string, string> = {
                purpose: "credits_topup_offsession",
                workspace_id: args.workspaceId,
                request_id: args.requestId,
                auto_top_up_amount_nanos: String(chargeResult.auto_top_up_amount_nanos),
                auto_top_up_payment_method_id: paymentMethod,
            };

            const paymentIntent = await stripe.paymentIntents.create(
                {
                    amount: amount_cents,
                    currency: "usd",
                    customer: chargeResult.stripe_customer_id ?? undefined,
                    payment_method: paymentMethod,
                    off_session: true,
                    confirm: true,
                    metadata: topUpMetadata,
                },
                {
                    idempotencyKey: buildAutoTopUpIdempotencyKey({
                        workspaceId: args.workspaceId,
                        requestId: args.requestId,
                    }),
                }
            );

            // Log success or handle failure
            console.log(`[auto-recharge] Initiated for team ${args.workspaceId}, payment intent ${paymentIntent.id}, amount: $${(amount_cents / 100).toFixed(2)}`);
        }
        return chargeResult;
    } finally {
        releaseRuntime();
    }
}










