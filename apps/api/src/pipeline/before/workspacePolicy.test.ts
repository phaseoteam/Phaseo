import { describe, expect, it } from "vitest";
import { applyWorkspacePolicy, buildWorkspacePolicy } from "./workspacePolicy";

function candidate(args: {
    providerId: string;
    apiModelId?: string | null;
}) {
    return {
        providerId: args.providerId,
        apiModelId: args.apiModelId ?? null,
        pricingKey: args.apiModelId ? `${args.providerId}:${args.apiModelId}` : args.providerId,
        providerStatus: "active",
        providerRoutingStatus: "active",
        modelRoutingStatus: "active",
        capabilityStatus: "active",
        adapter: { name: args.providerId } as any,
        baseWeight: 1,
        byokMeta: [],
        pricingCard: null,
        providerModelSlug: null,
    } as any;
}

describe("applyWorkspacePolicy", () => {
    it("filters ai-stats/free providers by concrete allowed model ids", () => {
        const result = applyWorkspacePolicy({
            providers: [
                candidate({
                    providerId: "openai",
                    apiModelId: "openai/gpt-free-b",
                }),
                candidate({
                    providerId: "google-ai-studio",
                    apiModelId: "google/gemini-free",
                }),
            ],
            resolvedModel: "ai-stats/free",
            body: {},
            workspacePolicy: {
                providerAllowlist: null,
                providerBlocklist: null,
                allowedApiModels: ["google/gemini-free"],
                promptInjectionAction: null,
                promptInjectionGuardrailIds: [],
                sensitiveInfoRules: [],
                sensitiveInfoGuardrailIds: [],
                enforceAllowed: false,
                activeGuardrailIds: [],
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.providers).toHaveLength(1);
        expect(result.providers[0]?.providerId).toBe("google-ai-studio");
    });

    it("filters provider candidates by blocked model ids", () => {
        const result = applyWorkspacePolicy({
            providers: [
                candidate({
                    providerId: "openai",
                    apiModelId: "openai/gpt-4.1-mini",
                }),
                candidate({
                    providerId: "anthropic",
                    apiModelId: "anthropic/claude-sonnet-4",
                }),
            ],
            resolvedModel: "ai-stats/free",
            body: {},
            workspacePolicy: {
                providerAllowlist: null,
                providerBlocklist: null,
                allowedApiModels: null,
                blockedApiModels: ["openai/gpt-4.1-mini"],
                promptInjectionAction: null,
                promptInjectionGuardrailIds: [],
                sensitiveInfoRules: [],
                sensitiveInfoGuardrailIds: [],
                enforceAllowed: false,
                activeGuardrailIds: [],
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.providers).toHaveLength(1);
        expect(result.providers[0]?.providerId).toBe("anthropic");
    });

    it("merges model blocklists across enabled guardrails", () => {
        const policy = buildWorkspacePolicy({
            guardrails: [
                {
                    id: "gr_block_a",
                    model_restriction_mode: "blocklist",
                    allowed_api_model_ids: ["openai/gpt-4.1-mini"],
                },
                {
                    id: "gr_block_b",
                    model_restriction_mode: "blocklist",
                    allowed_api_model_ids: ["anthropic/claude-sonnet-4"],
                },
            ] as any,
        });

        expect(policy.blockedApiModels).toEqual([
            "openai/gpt-4.1-mini",
            "anthropic/claude-sonnet-4",
        ]);
    });

    it("merges sensitive info rules by most restrictive action", () => {
        const policy = buildWorkspacePolicy({
            guardrails: [
                {
                    id: "gr_flag",
                    sensitive_info_enabled: true,
                    sensitive_info_default_action: "flag",
                    sensitive_info_rules: [
                        {
                            id: "email_address",
                            kind: "builtin",
                            enabled: true,
                            action: "flag",
                        },
                    ],
                },
                {
                    id: "gr_block",
                    sensitive_info_enabled: true,
                    sensitive_info_default_action: "redact",
                    sensitive_info_rules: [
                        {
                            id: "email_address",
                            kind: "builtin",
                            enabled: true,
                            action: "block",
                        },
                        {
                            id: "ip_address",
                            kind: "builtin",
                            enabled: true,
                            action: "redact",
                        },
                    ],
                },
            ] as any,
        });

        expect(policy.sensitiveInfoGuardrailIds).toEqual(["gr_flag", "gr_block"]);
        expect(policy.sensitiveInfoRules).toEqual([
            { id: "email_address", kind: "builtin", action: "block" },
            { id: "ip_address", kind: "builtin", action: "redact" },
        ]);
    });

    it("preserves valid custom sensitive info rules", () => {
        const policy = buildWorkspacePolicy({
            guardrails: [
                {
                    id: "gr_custom",
                    sensitive_info_enabled: true,
                    sensitive_info_default_action: "flag",
                    sensitive_info_rules: [
                        {
                            id: "custom-acct",
                            kind: "custom",
                            enabled: true,
                            action: "redact",
                            name: "Account ID",
                            pattern: "ACCT-[0-9]{6}",
                            flags: "i",
                        },
                    ],
                },
            ] as any,
        });

        expect(policy.sensitiveInfoGuardrailIds).toEqual(["gr_custom"]);
        expect(policy.sensitiveInfoRules).toEqual([
            {
                id: "custom-acct",
                kind: "custom",
                action: "redact",
                name: "Account ID",
                pattern: "ACCT-[0-9]{6}",
                flags: "i",
            },
        ]);
    });
});
