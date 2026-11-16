import { describe, expect, it } from "vitest";
import { resolveStripeSecretKey } from "./stripe";

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe("resolveStripeSecretKey", () => {
    it("never falls back to TEST_STRIPE_SECRET_KEY", () => {
        expect(() => resolveStripeSecretKey(env({ TEST_STRIPE_SECRET_KEY: "sk_test_123", NODE_ENV: "development" }))).toThrow(
            "STRIPE_SECRET_KEY is missing",
        );
    });

    it("refuses a test key in production", () => {
        expect(() =>
            resolveStripeSecretKey(env({ STRIPE_SECRET_KEY: "sk_test_123", PHASEO_ENV: "production", NODE_ENV: "production" })),
        ).toThrow("not a live Stripe key");
    });

    it("uses a live key in production", () => {
        expect(resolveStripeSecretKey(env({ STRIPE_SECRET_KEY: " sk_live_123 ", PHASEO_ENV: "production", NODE_ENV: "production" }))).toBe(
            "sk_live_123",
        );
        expect(resolveStripeSecretKey(env({ STRIPE_SECRET_KEY: "rk_live_123", PHASEO_ENV: "production", NODE_ENV: "production" }))).toBe(
            "rk_live_123",
        );
    });

    it("allows a test key in local development", () => {
        expect(resolveStripeSecretKey(env({ STRIPE_SECRET_KEY: "sk_test_123", PHASEO_ENV: "production", NODE_ENV: "development" }))).toBe(
            "sk_test_123",
        );
    });
});
