import { describe, expect, it } from "vitest";
import { applyWorkspacePolicy, buildWorkspacePolicy } from "./workspacePolicy";

function candidate(args: {
    providerId: string;
    apiModelId?: string | null;
    dataPolicyTier?: "unknown" | "private" | "logs" | "trains" | null;
    dataPolicyConfidence?: "unknown" | "confirmed" | "maybe" | null;
    pricing?: "free" | "paid" | "unknown";
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
        ...(args.pricing === "free"
            ? {
                  pricingCard: {
                      provider: args.providerId,
                      model: args.apiModelId ?? "test/model",
                      endpoint: "responses",
                      effective_from: null,
                      effective_to: null,
                      currency: "USD",
                      version: null,
                      rules: [
                          {
                              pricing_plan: "standard",
                              meter: "input_tokens",
                              unit: "token",
                              unit_size: 1,
                              price_per_unit: "0",
                              currency: "USD",
                              match: [],
                              priority: 100,
                          },
                      ],
                  },
              }
            : {}),
        ...(args.pricing === "paid"
            ? {
                  pricingCard: {
                      provider: args.providerId,
                      model: args.apiModelId ?? "test/model",
                      endpoint: "responses",
                      effective_from: null,
                      effective_to: null,
                      currency: "USD",
                      version: null,
                      rules: [
                          {
                              pricing_plan: "standard",
                              meter: "input_tokens",
                              unit: "token",
                              unit_size: 1,
                              price_per_unit: "0.000001",
                              currency: "USD",
                              match: [],
                              priority: 100,
                          },
                      ],
                  },
              }
            : {}),
        providerModelSlug: null,
        dataPolicyTier: args.dataPolicyTier ?? null,
        dataPolicyConfidence: args.dataPolicyConfidence ?? null,
    } as any;
}

describe("applyWorkspacePolicy", () => {
	it("treats an explicit empty provider allowlist as deny all", () => {
		const result = applyWorkspacePolicy({
			providers: [
				candidate({ providerId: "openai", apiModelId: "openai/gpt-5" }),
			],
			resolvedModel: "openai/gpt-5",
			body: {},
			workspacePolicy: {
				providerAllowlist: [],
				providerBlocklist: null,
				allowedApiModels: null,
				blockedApiModels: null,
				promptInjectionAction: null,
				promptInjectionGuardrailIds: [],
				sensitiveInfoRules: [],
				sensitiveInfoGuardrailIds: [],
				enforceAllowed: true,
				activeGuardrailIds: [],
			},
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("no_providers");
		expect(result.diagnostics.providerAllowlist).toEqual([]);
		expect(result.diagnostics.afterCount).toBe(0);
	});

	it("filters providers that log prompts when input/output logging is disabled", () => {
		const result = applyWorkspacePolicy({
			providers: [
				candidate({
					providerId: "logs-provider",
					apiModelId: "test/model",
					dataPolicyTier: "logs",
					dataPolicyConfidence: "maybe",
				}),
				candidate({
					providerId: "private-provider",
					apiModelId: "test/model",
					dataPolicyTier: "private",
					dataPolicyConfidence: "confirmed",
				}),
			],
			resolvedModel: "test/model",
			body: {},
			workspacePolicy: null,
			teamSettings: {
				routingMode: null,
				byokFallbackEnabled: null,
				betaChannelEnabled: false,
				privacyEnableInputOutputLogging: false,
				privacyEnablePaidMayTrain: true,
				privacyEnableFreeMayTrain: true,
				privacyZdrOnly: false,
				billingMode: "wallet",
			},
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.providers.map((provider) => provider.providerId)).toEqual([
			"private-provider",
		]);
		expect(result.diagnostics.droppedByPrivacy).toEqual([
			{
				providerId: "logs-provider",
				reason: "input_output_logging_disabled",
				dataPolicyTier: "logs",
				dataPolicyConfidence: "maybe",
				routeCostKind: "unknown",
			},
		]);
	});

	it("filters paid training providers when paid may-train is disabled", () => {
		const result = applyWorkspacePolicy({
			providers: [
				candidate({
					providerId: "trains-paid",
					apiModelId: "test/model",
					dataPolicyTier: "trains",
					pricing: "paid",
				}),
				candidate({
					providerId: "trains-free",
					apiModelId: "test/model",
					dataPolicyTier: "trains",
					pricing: "free",
				}),
			],
			resolvedModel: "test/model",
			body: {},
			workspacePolicy: null,
			teamSettings: {
				routingMode: null,
				byokFallbackEnabled: null,
				betaChannelEnabled: false,
				privacyEnableInputOutputLogging: true,
				privacyEnablePaidMayTrain: false,
				privacyEnableFreeMayTrain: true,
				privacyZdrOnly: false,
				billingMode: "wallet",
			},
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.providers.map((provider) => provider.providerId)).toEqual([
			"trains-free",
		]);
		expect(result.diagnostics.droppedByPrivacy[0]).toMatchObject({
			providerId: "trains-paid",
			reason: "paid_training_disabled",
			routeCostKind: "paid",
		});
	});

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

	it("treats provider.only aliases as the canonical provider id", () => {
		const result = applyWorkspacePolicy({
			providers: [
				candidate({
					providerId: "novita",
					apiModelId: "deepseek/deepseek-r1-turbo",
				}),
				candidate({
					providerId: "openai",
					apiModelId: "openai/gpt-5-nano",
				}),
			],
			resolvedModel: "deepseek/deepseek-r1-turbo",
			body: {
				provider: {
					only: ["NovitaAI"],
				},
			},
			workspacePolicy: {
				providerAllowlist: null,
				providerBlocklist: null,
				allowedApiModels: null,
				blockedApiModels: null,
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
		expect(result.providers[0]?.providerId).toBe("novita");
		expect(result.diagnostics.requestProviderOnly).toEqual(["novita"]);
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
