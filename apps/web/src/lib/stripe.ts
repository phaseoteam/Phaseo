// lib/stripe.ts
import Stripe from "stripe";
import { getPhaseoEnv } from "@/lib/deployEnv";

/**
 * The Stripe secret key for this deployment. Only STRIPE_SECRET_KEY is read: there is
 * deliberately no fallback to a test key, so a missing live key fails loudly instead of
 * sending real customers to a Stripe sandbox. Production also refuses a test key placed in
 * STRIPE_SECRET_KEY. Local development may use an sk_test_ key in STRIPE_SECRET_KEY.
 */
export function resolveStripeSecretKey(env: NodeJS.ProcessEnv = process.env): string {
    const key = env.STRIPE_SECRET_KEY?.trim();
    if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
    if (isProductionDeployment(env) && !isLiveStripeSecretKey(key)) {
        throw new Error("STRIPE_SECRET_KEY is not a live Stripe key; production refuses test-mode keys");
    }
    return key;
}

export function isLiveStripeSecretKey(key: string): boolean {
    return key.startsWith("sk_live_") || key.startsWith("rk_live_");
}

/** The production website (not local dev or a preview). */
export function isProductionDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
    return getPhaseoEnv(env) === "production" && env.NODE_ENV === "production";
}

export function getStripe() {
    return new Stripe(resolveStripeSecretKey(), { apiVersion: "2026-06-24.dahlia" });
}

/**
 * The Stripe sandbox key, used only by the admin test checkout and the sandbox webhook. It is a
 * separate setting (STRIPE_SANDBOX_SECRET_KEY) that getStripe() never reads, and it must be a
 * test-mode key, so the sandbox can never charge real cards.
 */
export function resolveSandboxStripeSecretKey(env: NodeJS.ProcessEnv = process.env): string {
    const key = env.STRIPE_SANDBOX_SECRET_KEY?.trim();
    if (!key) throw new Error("STRIPE_SANDBOX_SECRET_KEY is missing");
    if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
        throw new Error("STRIPE_SANDBOX_SECRET_KEY must be a test-mode key");
    }
    return key;
}

export function getSandboxStripe() {
    return new Stripe(resolveSandboxStripeSecretKey(), { apiVersion: "2026-06-24.dahlia" });
}

/** The workspace that sandbox payments credit (STRIPE_SANDBOX_WORKSPACE_ID), or null when unset. */
export function readStripeSandboxWorkspaceId(env: NodeJS.ProcessEnv = process.env): string | null {
    return env.STRIPE_SANDBOX_WORKSPACE_ID?.trim() || null;
}
