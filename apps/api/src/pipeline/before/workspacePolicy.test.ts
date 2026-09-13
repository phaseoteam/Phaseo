import { describe, expect, it } from "vitest";
import { applyWorkspacePolicy, buildWorkspacePolicy, isOptionalDynamicRouteSchemaUnavailable, shouldApplyLegacyAccountPolicy } from "./workspacePolicy";

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
	it("limits the legacy account overlay to the managed Chat key", () => {
		expect(shouldApplyLegacyAccountPolicy("__chat_route_managed_key__")).toBe(true);
		expect(shouldApplyLegacyAccountPolicy("Production API")).toBe(false);
		expect(shouldApplyLegacyAccountPolicy(null)).toBe(false);
	});

	it("keeps workspace route blocks when scoped guardrails allow other routes", () => {
		const policy = buildWorkspacePolicy({
			globalSettings: { provider_restriction_mode: "blocklist", provider_restriction_provider_ids: ["openai"], model_restriction_mode: "blocklist", model_restriction_model_ids: ["test/model"] },
			guardrails: [{ id: "guardrail", provider_restriction_mode: "none", allowed_api_model_ids: [] }],
		});
		expect(policy.providerBlocklist).toEqual(["openai"]);
		expect(policy.blockedApiModels).toEqual(["test/model"]);
		expect(policy.accountPolicyApplied).toBe(false);
	});

	it("applies workspace-wide model restrictions before scoped guardrails", () => {
		const policy = buildWorkspacePolicy({
			globalSettings: {
				model_restriction_mode: "blocklist",
				model_restriction_model_ids: ["openai/gpt-5"],
			},
			guardrails: [],
		});

		expect(policy.blockedApiModels).toEqual(["openai/gpt-5"]);
	});

	it("combines workspace and guardrail privacy settings in the stricter direction", () => {
		const policy = buildWorkspacePolicy({
			globalSettings: { privacy_enable_input_output_logging: false, privacy_zdr_only: true },
			guardrails: [{ id: "guardrail", privacy_enable_input_output_logging: true, privacy_zdr_only: false }],
		});
		expect(policy.privacyEnableInputOutputLogging).toBe(false);
		expect(policy.privacyZdrOnly).toBe(true);
	});

	it("loads every data-handling rule from the workspace baseline", () => {
		const policy = buildWorkspacePolicy({
			globalSettings: {
				privacy_enable_paid_may_train: false,
				privacy_enable_free_may_train: false,
				privacy_enable_input_output_logging: false,
				privacy_zdr_only: true,
			},
		});

		expect(policy).toMatchObject({
			privacyEnablePaidMayTrain: false,
			privacyEnableFreeMayTrain: false,
			privacyEnableInputOutputLogging: false,
			privacyZdrOnly: true,
		});
	});

	it("preserves saved Chat privacy controls in the stricter direction", () => {
		const policy = buildWorkspacePolicy({
			globalSettings: {
				privacy_enable_input_output_logging: true,
				provider_restriction_mode: "allowlist",
				provider_restriction_provider_ids: ["openai", "anthropic"],
			},
			legacyAccountSettings: {
				privacy_enable_input_output_logging: false,
				privacy_zdr_only: true,
				provider_restriction_mode: "allowlist",
				provider_restriction_provider_ids: ["anthropic"],
			},
		});

		expect(policy.privacyEnableInputOutputLogging).toBe(false);
		expect(policy.privacyZdrOnly).toBe(true);
		expect(policy.providerAllowlist).toEqual(["anthropic"]);
		expect(policy.accountPolicyApplied).toBe(true);
	});

	it("intersects workspace allowlists with scoped guardrail allowlists", () => {
		const policy = buildWorkspacePolicy({
			globalSettings: {
				provider_restriction_mode: "allowlist",
				provider_restriction_provider_ids: ["openai", "anthropic"],
				model_restriction_mode: "allowlist",
				model_restriction_model_ids: ["openai/gpt-5", "anthropic/claude"],
			},
			guardrails: [{
				id: "guardrail",
				provider_restriction_mode: "allowlist",
				provider_restriction_provider_ids: ["anthropic"],
				model_restriction_mode: "allowlist",
				allowed_api_model_ids: ["anthropic/claude"],
			}],
		});
		expect(policy.providerAllowlist).toEqual(["anthropic"]);
		expect(policy.allowedApiModels).toEqual(["anthropic/claude"]);
	});

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
					dataPolicyConfidence: "confirmed",
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
				dataPolicyConfidence: "confirmed",
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
					dataPolicyConfidence: "confirmed",
					pricing: "paid",
				}),
				candidate({
					providerId: "trains-free",
					apiModelId: "test/model",
					dataPolicyTier: "trains",
					dataPolicyConfidence: "confirmed",
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

	it("fails closed for unknown or unverified data policies when privacy controls are restrictive", () => {
		const result = applyWorkspacePolicy({
			providers: [
				candidate({ providerId: "unknown", apiModelId: "test/model" }),
				candidate({
					providerId: "unverified",
					apiModelId: "test/model",
					dataPolicyTier: "private",
					dataPolicyConfidence: "maybe",
				}),
			],
			resolvedModel: "test/model",
			body: {},
			workspacePolicy: null,
			teamSettings: {
				routingMode: null,
				byokFallbackEnabled: false,
				betaChannelEnabled: false,
				privacyEnableInputOutputLogging: false,
				privacyEnablePaidMayTrain: false,
				privacyEnableFreeMayTrain: false,
				privacyZdrOnly: false,
				billingMode: "wallet",
			},
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.diagnostics.droppedByPrivacy).toEqual([
			expect.objectContaining({ providerId: "unknown", reason: "data_policy_unknown" }),
			expect.objectContaining({ providerId: "unverified", reason: "data_policy_unverified" }),
		]);
	});

	it("enforces ZDR-only routing", () => {
		const result = applyWorkspacePolicy({
			providers: [
				candidate({ providerId: "optional-zdr", apiModelId: "test/model", dataPolicyTier: "private", dataPolicyConfidence: "confirmed" }),
				{ ...candidate({ providerId: "default-zdr", apiModelId: "test/model", dataPolicyTier: "private", dataPolicyConfidence: "confirmed" }), zeroDataRetention: true },
			],
			resolvedModel: "test/model",
			body: {},
			workspacePolicy: {
				providerAllowlist: null,
				providerBlocklist: null,
				allowedApiModels: null,
				blockedApiModels: null,
				promptInjectionAction: null,
				promptInjectionGuardrailIds: [],
				sensitiveInfoRules: [],
				sensitiveInfoGuardrailIds: [],
				privacyZdrOnly: true,
				enforceAllowed: false,
				activeGuardrailIds: [],
			},
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.providers.map((provider) => provider.providerId)).toEqual(["default-zdr"]);
		expect(result.diagnostics.droppedByPrivacy[0]).toMatchObject({ providerId: "optional-zdr", reason: "zdr_required" });
	});

    it("filters phaseo/free providers by concrete allowed model ids", () => {
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
            resolvedModel: "phaseo/free",
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
            resolvedModel: "phaseo/free",
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

	it("keeps Wafer ZDR distinct from ordinary Wafer in provider hints", () => {
		const providers = [
			candidate({ providerId: "wafer", apiModelId: "test/model" }),
			candidate({ providerId: "wafer-zdr", apiModelId: "test/model" }),
		];
		const onlyZdr = applyWorkspacePolicy({ providers, resolvedModel: "test/model", body: { provider: { only: ["wafer-zdr"] } }, workspacePolicy: null });
		expect(onlyZdr.ok).toBe(true);
		if (onlyZdr.ok) expect(onlyZdr.providers.map((provider) => provider.providerId)).toEqual(["wafer-zdr"]);
		const ignoreZdr = applyWorkspacePolicy({ providers, resolvedModel: "test/model", body: { provider: { ignore: ["wafer-zdr"] } }, workspacePolicy: null });
		expect(ignoreZdr.ok).toBe(true);
		if (ignoreZdr.ok) expect(ignoreZdr.providers.map((provider) => provider.providerId)).toEqual(["wafer"]);
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

	it("merges prompt-injection and privacy guardrails by the strictest policy", () => {
		const policy = buildWorkspacePolicy({
			guardrails: [
				{
					id: "gr_flag",
					prompt_injection_enabled: true,
					prompt_injection_action: "flag",
					privacy_enable_paid_may_train: false,
				},
				{
					id: "gr_block",
					prompt_injection_enabled: true,
					prompt_injection_action: "block",
					privacy_enable_input_output_logging: false,
					privacy_zdr_only: true,
				},
			] as any,
		});

		expect(policy.promptInjectionAction).toBe("block");
		expect(policy.promptInjectionGuardrailIds).toEqual(["gr_flag", "gr_block"]);
		expect(policy.privacyEnablePaidMayTrain).toBe(false);
		expect(policy.privacyEnableFreeMayTrain).toBe(true);
		expect(policy.privacyEnableInputOutputLogging).toBe(false);
		expect(policy.privacyZdrOnly).toBe(true);
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


describe("isOptionalDynamicRouteSchemaUnavailable", () => {
	it("allows a rollout fallback when the dynamic-route link table is absent", () => {
		expect(isOptionalDynamicRouteSchemaUnavailable({
			code: "PGRST205",
			message: "Could not find the table 'public.gateway_dynamic_route_keys' in the schema cache",
		})).toBe(true);
	});

	it("allows a rollout fallback when the dynamic-route table relation is absent", () => {
		expect(isOptionalDynamicRouteSchemaUnavailable({
			code: "42P01",
			message: 'relation "gateway_dynamic_routes" does not exist',
		})).toBe(true);
	});

	it("keeps permission and unrelated schema errors fail-closed", () => {
		expect(isOptionalDynamicRouteSchemaUnavailable({
			code: "42501",
			message: 'permission denied for table gateway_dynamic_route_keys',
		})).toBe(false);
		expect(isOptionalDynamicRouteSchemaUnavailable({
			code: "PGRST205",
			message: "Could not find the table 'public.workspace_guardrails' in the schema cache",
		})).toBe(false);
	});
});
