import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    checkApiProviderModelEntrySafety,
    checkPreviousModelReference,
    checkPricingEntrySafety,
    checkSubscriptionPlanModels,
    checkSubscriptionPlanShape,
    isMajorError,
    normalizedModelIdentity,
} from '@/data/validate';

const DATA_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

describe('model lineage reference checks', () => {
    test('unknown predecessor IDs fail unless explicitly grandfathered', () => {
        expect(checkPreviousModelReference({
            modelId: 'amazon/nova-2-lite',
            organisationId: 'amazon',
            previousModelId: 'amazon/not-a-model',
            previousModelExists: false,
        })).toEqual([
            'Model amazon/nova-2-lite references unknown previous_model_id amazon/not-a-model',
        ]);
        expect(checkPreviousModelReference({
            modelId: 'legacy/model',
            previousModelId: 'legacy/internal-model',
            previousModelExists: false,
            isLegacyException: true,
        })).toEqual([]);
    });

    test('self-links and cross-organisation predecessors fail', () => {
        expect(checkPreviousModelReference({
            modelId: 'amazon/nova',
            organisationId: 'amazon',
            previousModelId: 'amazon/nova',
            previousModelExists: true,
            previousModelOrganisationId: 'amazon',
        })).toContain('Model amazon/nova cannot reference itself as previous_model_id');
        expect(checkPreviousModelReference({
            modelId: 'amazon/nova',
            organisationId: 'amazon',
            previousModelId: 'openai/gpt',
            previousModelExists: true,
            previousModelOrganisationId: 'openai',
        })[0]).toContain('from a different organisation');
    });
});

describe('subscription plan model checks', () => {
    test('duplicate model IDs are rejected before import', () => {
        expect(checkSubscriptionPlanModels(
            'example-plan',
            [
                { model_id: 'example/model' },
                { model_id: 'example/model' },
            ],
            new Set(['example/model']),
        )).toEqual([
            'Subscription plan example-plan contains duplicate model example/model',
        ]);
    });
});

describe('subscription plan shape checks', () => {
    test('rejects missing pricing, feature, and model arrays', () => {
        expect(checkSubscriptionPlanShape('example-plan', {})).toEqual([
            'Subscription plan example-plan must contain at least one pricing option',
            'Subscription plan example-plan features must be an array',
            'Subscription plan example-plan models must be an array',
        ]);
    });

    test('rejects invalid prices, frequencies, and source links', () => {
        expect(checkSubscriptionPlanShape('example-plan', {
            pricing_options: [{ frequency: 'weekly', usd_price: -1, link: 'http://example.com' }],
            features: [],
            models: [],
        })).toEqual([
            'Subscription plan example-plan pricing option 0 has unsupported frequency weekly',
            'Subscription plan example-plan pricing option 0 must have a non-negative finite usd_price',
            'Subscription plan example-plan pricing option 0 source link must use HTTPS',
        ]);
    });

    test('accepts a valid usage-priced plan', () => {
        expect(checkSubscriptionPlanShape('example-plan', {
            pricing_options: [{ frequency: 'usage', usd_price: 0, link: 'https://example.com/pricing' }],
            features: [],
            models: [],
        })).toEqual([]);
    });
});

describe('model identity normalization', () => {
    test('collapses a redundant organisation prefix without changing distinct models', () => {
        expect(normalizedModelIdentity(
            'nvidia/nvidia-nemotron-nano-9b-v2',
            'nvidia',
        )).toBe(normalizedModelIdentity('nvidia/nemotron-nano-9b-v2', 'nvidia'));
        expect(normalizedModelIdentity(
            'nvidia/nemotron-nano-9b-v2',
            'nvidia',
        )).not.toBe(normalizedModelIdentity('nvidia/nemotron-nano-12b-v2', 'nvidia'));
    });
});

describe('validation error severity', () => {
    test('classifies duplicate model_id errors as major', () => {
        expect(isMajorError('Duplicate model_id detected: nvidia/example')).toBe(true);
    });
});

function readPricingJson(relativePath: string) {
    return JSON.parse(fs.readFileSync(path.join(DATA_ROOT, relativePath), 'utf8'));
}

function readProviderModels(providerId: string) {
    return JSON.parse(
        fs.readFileSync(path.join(DATA_ROOT, 'api_providers', providerId, 'models.json'), 'utf8')
    );
}

describe('pricing safety checks', () => {
    test('active on gateway with no rules -> error flagged', () => {
        const bad = {
            key: 'openai:gpt-4o:chat.completions',
            api_provider_id: 'openai',
            model_id: 'gpt-4o',
            endpoint: 'chat.completions',
            is_active_gateway: true,
            rules: [],
        };
        const errs = checkPricingEntrySafety(bad);
        expect(errs.some((e) => /active on gateway but no rules/.test(e))).toBe(true);
        expect(errs.some(isMajorError)).toBe(true);
    });

    test('invalid key format -> error', () => {
        const bad = {
            key: 'mismatch:key',
            api_provider_id: 'openrouter',
            model_id: 'some-model',
            endpoint: 'chat.completions',
            is_active_gateway: false,
            rules: [
                { meter: 'input_text_tokens', unit_size: 1, price_usd_per_unit: 0.000001, bill: { mode: 'all' } },
            ],
        };
        const errs = checkPricingEntrySafety(bad);
        expect(errs.some((e) => /invalid key/.test(e))).toBe(true);
    });

    test('unknown meter -> error', () => {
        const bad = {
            key: 'foo:bar:baz',
            api_provider_id: 'foo',
            model_id: 'bar',
            endpoint: 'baz',
            is_active_gateway: false,
            rules: [
                { meter: 'unknown_meter', unit_size: 1, price_usd_per_unit: 0.01, bill: { mode: 'all' } },
            ],
        };
        const errs = checkPricingEntrySafety(bad);
        expect(errs.some((e) => /unknown meter/.test(e))).toBe(true);
    });

    test('new canonical pricing meters are accepted', () => {
        const allowed = [
            'input_characters',
            'input_text_bytes',
            'input_pages',
            'input_audio_minutes',
            'output_reasoning_tokens',
            'bfl_credits',
            'output_video',
            'cached_write_text_tokens_5m',
            'cached_write_text_tokens_1h',
        ] as const;
        for (const meter of allowed) {
            const entry = {
                key: 'foo:bar:baz',
                api_provider_id: 'foo',
                model_id: 'bar',
                endpoint: 'baz',
                is_active_gateway: false,
                rules: [{ meter, unit_size: 1, price_per_unit: 0.01, bill: { mode: 'all' } }],
            };
            const errs = checkPricingEntrySafety(entry);
            expect(errs.some((e) => /unknown meter/.test(e))).toBe(false);
        }
    });

    test('bare rule timestamps without Z -> error', () => {
        const bad = {
            key: 'p:m:e',
            api_provider_id: 'p',
            model_id: 'm',
            endpoint: 'e',
            is_active_gateway: false,
            rules: [
                {
                    meter: 'input_text_tokens',
                    unit_size: 1,
                    price_per_unit: 0.0025,
                    bill: { mode: 'all' },
                    effective_from: '2026-05-22T00:00:00',
                    effective_to: '2026-05-23T00:00:00',
                },
            ],
        };
        const errs = checkPricingEntrySafety(bad);
        expect(errs).toEqual(
            expect.arrayContaining([
                expect.stringContaining('rule effective_from must use explicit UTC timestamp with Z'),
                expect.stringContaining('rule effective_to must use explicit UTC timestamp with Z'),
            ])
        );
        expect(errs.some(isMajorError)).toBe(true);
    });

    test('mixed aggregate and detailed input meters -> error', () => {
        const bad = {
            key: 'p:m:e',
            api_provider_id: 'p',
            model_id: 'm',
            endpoint: 'e',
            is_active_gateway: false,
            rules: [
                { meter: 'input_tokens', unit_size: 1, price_usd_per_unit: 0.0025, bill: { mode: 'all' } },
                { meter: 'input_text_tokens', unit_size: 1, price_usd_per_unit: 0.0025, bill: { mode: 'all' } },
            ],
        };
        const errs = checkPricingEntrySafety(bad);
        expect(errs.some((e) => /mixed aggregate and detailed input meters/.test(e))).toBe(true);
    });

    test('heuristic: output price should not be lower than input price', () => {
        const bad = {
            key: 'p:m:e',
            api_provider_id: 'p',
            model_id: 'm',
            endpoint: 'e',
            is_active_gateway: false,
            rules: [
                { meter: 'input_text_tokens', unit_size: 1, price_usd_per_unit: 0.0025, bill: { mode: 'all' } },
                { meter: 'output_text_tokens', unit_size: 1, price_usd_per_unit: 0.0024, bill: { mode: 'all' } },
            ],
        };
        const errs = checkPricingEntrySafety(bad);
        expect(errs.some((e) => /output_text_tokens price < input_text_tokens/.test(e))).toBe(true);
    });

    test('heuristic: cached_read <= input price', () => {
        const bad = {
            key: 'p:m:e',
            api_provider_id: 'p',
            model_id: 'm',
            endpoint: 'e',
            is_active_gateway: false,
            rules: [
                { meter: 'input_text_tokens', unit_size: 1, price_usd_per_unit: 0.0025, bill: { mode: 'all' } },
                { meter: 'cached_read_text_tokens', unit_size: 1, price_usd_per_unit: 0.003, bill: { mode: 'all' } },
            ],
        };
        const errs = checkPricingEntrySafety(bad);
        expect(errs.some((e) => /cached_read_text_tokens price > input_text_tokens/.test(e))).toBe(true);
    });

    test('GMICloud MiniMax M3 includes cached-read pricing for high-context requests', () => {
        const pricing = readPricingJson(
            'pricing/gmicloud/minimax-minimax-m3/text.generate/pricing.json'
        );
        expect(pricing.rules).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    meter: 'cached_read_text_tokens',
                    price_per_unit: 0.24,
                    match: expect.arrayContaining([
                        expect.objectContaining({
                            path: 'input_tokens',
                            op: 'gt',
                            value: 512000,
                        }),
                    ]),
                }),
            ])
        );
    });

    test.each(['gmicloud', 'novita'])('%s Kimi K3 pricing matches the provider catalog', (providerId) => {
        const pricing = readPricingJson(
            `pricing/${providerId}/moonshotai-kimi-k3/text.generate/pricing.json`
        );
        expect(pricing.rules).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ meter: 'input_text_tokens', price_per_unit: 3 }),
                expect.objectContaining({ meter: 'cached_read_text_tokens', price_per_unit: 0.3 }),
                expect.objectContaining({ meter: 'output_text_tokens', price_per_unit: 15 }),
            ])
        );
    });

    test('Venice Kimi K3 pricing matches the live standard route', () => {
        const pricing = readPricingJson(
            'pricing/venice/moonshotai-kimi-k3/text.generate/pricing.json'
        );
        expect(pricing.rules).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    meter: 'input_text_tokens',
                    price_per_unit: 3.75,
                    pricing_plan: 'standard',
                    unit_size: 1000000,
                    currency: 'USD',
                }),
                expect.objectContaining({
                    meter: 'cached_read_text_tokens',
                    price_per_unit: 0.375,
                    pricing_plan: 'standard',
                    unit_size: 1000000,
                    currency: 'USD',
                }),
                expect.objectContaining({
                    meter: 'output_text_tokens',
                    price_per_unit: 18.75,
                    pricing_plan: 'standard',
                    unit_size: 1000000,
                    currency: 'USD',
                }),
            ])
        );
    });

    test('Google Vertex image model does not advertise flex pricing without executor support', () => {
        const pricing = readPricingJson(
            'pricing/google-vertex/google-gemini-3.1-flash-lite-image/text.generate/pricing.json'
        );
        expect(pricing.rules.some((rule: any) => rule?.pricing_plan === 'flex')).toBe(false);
    });

    test('GLM 5.3 Flash captures provider discounts and active list-price comparisons', () => {
        for (const provider of ['z-ai', 'gmicloud', 'novita']) {
            const pricing = readPricingJson(
                `pricing/${provider}/z-ai-glm-5.3-flash/text.generate/pricing.json`
            );
            for (const [meter, discounted, list] of [
                ['input_text_tokens', 0.075, 0.15],
                ['cached_read_text_tokens', 0.015, 0.03],
                ['output_text_tokens', 0.25, 0.5],
            ] as const) {
                expect(pricing.rules).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            meter,
                            price_per_unit: discounted,
                            priority: 200,
                            effective_to: '2026-09-09T16:00:00Z',
                        }),
                        expect.objectContaining({
                            meter,
                            price_per_unit: list,
                            priority: 100,
                            effective_from: '2026-08-26T00:00:00Z',
                        }),
                    ])
                );
            }
        }

        const ioNet = readPricingJson(
            'pricing/io-net/z-ai-glm-5.3-flash/text.generate/pricing.json'
        );
        expect(ioNet.rules).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    meter: 'cached_read_text_tokens',
                    price_per_unit: 0.075,
                }),
            ])
        );
    });

    test('confirmed provider promotions retain active list-price comparisons', () => {
        const cases = [
            {
                path: 'pricing/friendli/lg-k-exaone-2.0/text.generate/pricing.json',
                prices: [
                    ['input_text_tokens', 0.6, 1.2],
                    ['cached_read_text_tokens', 0.12, 0.24],
                    ['output_text_tokens', 2.4, 4.8],
                ],
            },
            {
                path: 'pricing/upstage/upstage-solar-pro-4/text.generate/pricing.json',
                prices: [
                    ['input_text_tokens', 0.03, 0.3],
                    ['cached_read_text_tokens', 0.006, 0.06],
                    ['output_text_tokens', 0.12, 1.2],
                ],
                effective_from: '2026-08-11T00:00:00Z',
                effective_to: '2026-09-11T00:00:00Z',
            },
            ...[
                ['google-ai-studio', 'google/gemini-3.6-flash'],
                ['google-ai-studio', 'google/gemini-3.7-flash'],
                ['google-vertex', 'google/gemini-3.6-flash'],
                ['google-vertex', 'google/gemini-3.7-flash'],
            ].map(([provider, model]) => ({
                path: `pricing/${provider}/${model.replaceAll('/', '-')}/text.generate/pricing.json`,
                prices: [
                    ['input_text_tokens', 0.75, 1.5],
                    ['cached_read_text_tokens', 0.075, 0.15],
                    ['output_text_tokens', 3.75, 7.5],
                    ['cached_read_audio_tokens', 0.0375, 0.075],
                ],
                effective_from: '2026-08-13T00:00:00Z',
                effective_to: '2027-01-01T00:00:00Z',
            })),
        ];

        for (const entry of cases) {
            const pricing = readPricingJson(entry.path);
            for (const [meter, discounted, list] of entry.prices) {
                const window = entry.effective_from
                    ? { effective_from: entry.effective_from, effective_to: entry.effective_to }
                    : {};
                expect(pricing.rules).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ meter, price_per_unit: discounted, priority: 200, ...window }),
                        expect.objectContaining({ meter, price_per_unit: list, priority: 100, ...window }),
                    ])
                );
            }
        }
    });
});

describe('api provider model safety checks', () => {
    test('Lyria 3.5 remains unroutable until Google publishes an API model identifier', () => {
        const row = readProviderModels('google-ai-studio').find(
            (candidate: any) => candidate.api_model_id === 'google/lyria-3.5'
        );

        expect(row).toMatchObject({
            provider_model_slug: null,
            is_active_gateway: false,
            provider_status: 'unknown',
            phaseo_status: 'blocked',
            effective_from: null,
            routing_status: 'disabled',
            routable: false,
            verification: {
                status: 'verified',
                checked_at: '2026-09-03T00:00:00Z',
            },
        });
        expect(row.capabilities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    capability_id: 'music.generate',
                    status: 'disabled',
                }),
            ])
        );
    });

    test('Astra keeps its documented OpenAI contract and pricing while available', () => {
        const row = readProviderModels('openai').find(
            (candidate: any) => candidate.internal_model_id === 'openai/gpt-6-astra'
        );
        const proRow = readProviderModels('openai').find(
            (candidate: any) => candidate.internal_model_id === 'openai/gpt-6-astra-pro'
        );

        expect(row).toMatchObject({
            is_active_gateway: true,
            routable: true,
            routing_status: 'active',
            provider_status: 'available',
            phaseo_status: 'enabled',
            context_length: 1050000,
            max_output_tokens: 128000,
        });
        expect(row?.capabilities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    capability_id: 'text.generate',
                    status: 'active',
                    params: expect.arrayContaining([
                        expect.objectContaining({
                            param_id: 'reasoning.mode',
                            provider_default: 'standard',
                            values: ['standard', 'pro'],
                        }),
                    ]),
                }),
            ])
        );
        expect(proRow).toMatchObject({
            api_model_id: 'openai/gpt-6-astra-pro',
            provider_model_slug: 'gpt-6-astra-pro',
            internal_model_id: 'openai/gpt-6-astra-pro',
            is_active_gateway: true,
            routable: true,
        });
        expect(proRow?.capabilities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    capability_id: 'text.generate',
                    params: expect.arrayContaining([
                        expect.objectContaining({
                            param_id: 'reasoning.mode',
                            provider_default: 'pro',
                            values: ['standard', 'pro'],
                        }),
                    ]),
                }),
            ])
        );
        const pricingPath = path.join(
            DATA_ROOT,
            'pricing',
            'openai',
            'openai-gpt-6-astra',
            'text.generate',
            'pricing.json'
        );
        const pricing = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
        expect(pricing.rules).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    meter: 'input_text_tokens',
                    pricing_plan: 'standard',
                    price_per_unit: 10,
                    match: [{ path: 'input_tokens', op: 'lte', value: 272000 }],
                }),
                expect.objectContaining({
                    meter: 'output_text_tokens',
                    pricing_plan: 'standard',
                    price_per_unit: 75,
                    match: [{ path: 'input_tokens', op: 'gt', value: 272000 }],
                }),
                expect.objectContaining({
                    meter: 'native_web_search_requests',
                    pricing_plan: 'standard',
                    price_per_unit: 0.01,
                }),
            ])
        );
        const proPricingPath = path.join(
            DATA_ROOT,
            'pricing',
            'openai',
            'openai-gpt-6-astra-pro',
            'text.generate',
            'pricing.json'
        );
        const proPricing = JSON.parse(fs.readFileSync(proPricingPath, 'utf8'));
        expect(proPricing).toMatchObject({
            key: 'openai:openai/gpt-6-astra-pro:text.generate',
            api_model_id: 'openai/gpt-6-astra-pro',
            capability_id: 'text.generate',
        });
        expect(proPricing.rules).toHaveLength(pricing.rules.length);
    });

    test('Astra distinguishes upstream cloud availability from Phaseo routability', () => {
        const azureRow = readProviderModels('azure').find(
            (candidate: any) => candidate.internal_model_id === 'openai/gpt-6-astra'
        );
        const bedrockRow = readProviderModels('amazon-bedrock').find(
            (candidate: any) => candidate.internal_model_id === 'openai/gpt-6-astra'
        );

        expect(azureRow).toMatchObject({
            provider_status: 'available',
            phaseo_status: 'planned',
            routing_status: 'active',
            is_active_gateway: false,
            routable: false,
            service_tiers: [],
        });
        expect(bedrockRow).toMatchObject({
            provider_status: 'unknown',
            phaseo_status: 'planned',
            routing_status: 'disabled',
            is_active_gateway: false,
            routable: false,
        });
    });

    it('rejects internal routes whose Phaseo integration is not testing or enabled', () => {
        const result = checkApiProviderModelEntrySafety({
            api_model_id: 'anthropic/claude-mythos-5.1',
            provider_api_model_id: 'anthropic:anthropic/claude-mythos-5.1',
            provider_model_slug: 'claude-mythos-5-1',
            is_active_gateway: false,
            routable: false,
            routing_status: 'disabled',
            access_scope: 'internal',
            input_modalities: 'text,image',
            output_modalities: 'text',
        }, { providerId: 'anthropic' });

        expect(result.errors).toContain(
            'API provider model anthropic (anthropic:anthropic/claude-mythos-5.1) with internal access_scope must set phaseo_status to testing or enabled'
        );
    });

    test('Venice E2EE models remain unroutable until the encryption protocol is implemented', () => {
        const rows = readProviderModels('venice-e2ee');
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((row: any) => row.is_active_gateway === false && row.routable === false)).toBe(true);
    });

    test('Kimi K3 provider rows retain provider-specific limits and support', () => {
        const gmi = readProviderModels('gmicloud').find(
            (row: any) => row.provider_api_model_id === 'gmicloud:moonshotai/kimi-k3'
        );
        const novita = readProviderModels('novita').find(
            (row: any) => row.provider_api_model_id === 'novita:moonshotai/kimi-k3'
        );
        const veniceE2ee = readProviderModels('venice-e2ee').find(
            (row: any) => row.internal_model_id === 'moonshotai/kimi-k3'
        );

        expect(gmi).toMatchObject({
            is_active_gateway: true,
            quantization_scheme: 'FP8',
            input_modalities: 'text,image,video',
            output_modalities: 'text',
            context_length: 262144,
            max_output_tokens: null,
        });
        expect(novita).toMatchObject({
            is_active_gateway: true,
            input_modalities: 'text,image,video',
            output_modalities: 'text',
            context_length: 1048576,
            max_output_tokens: 1048576,
        });
        expect(novita.capabilities[0].params).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ param_id: 'tools' }),
                expect.objectContaining({ param_id: 'structured_outputs' }),
                expect.objectContaining({ param_id: 'include_reasoning' }),
            ])
        );
        expect(veniceE2ee).toBeUndefined();
    });

    test('Kimi K3 links include the official API reference, weights, and provider pricing', () => {
        const model = JSON.parse(
            fs.readFileSync(path.join(DATA_ROOT, 'models', 'moonshotai', 'kimi-k3', 'model.json'), 'utf8')
        );

        expect(model.links).toEqual(expect.arrayContaining([
            {
                title: 'Kimi K3 Tech Blog',
                kind: 'announcement',
                url: 'https://www.kimi.com/blog/kimi-k3',
            },
            {
                title: 'API Reference',
                kind: 'api_reference',
                url: 'https://platform.kimi.ai/docs/guide/kimi-k3-quickstart',
            },
            {
                title: 'Model Weights',
                kind: 'weights',
                url: 'https://huggingface.co/moonshotai/Kimi-K3',
            },
            {
                title: 'SiliconFlow pricing',
                kind: 'pricing',
                url: 'https://siliconflow.cn/pricing',
            },
        ]));
        expect(model.page_notice).toMatchObject({
            tone: 'info',
        });
        expect(model.page_notice.markdown).toContain('July 27, 2026 at 15:00 UTC');
    });

    test.each(['together', 'baseten', 'fireworks'])(
        '%s lists Kimi K3 as a verified coming-soon route',
        (providerId) => {
            const row = readProviderModels(providerId).find(
                (candidate: any) => candidate.internal_model_id === 'moonshotai/kimi-k3'
            );

            expect(row).toMatchObject({
                is_active_gateway: false,
                routable: false,
                effective_from: '2026-07-27T15:00:00Z',
                verification: {
                    status: 'verified',
                    checked_at: '2026-07-26T00:00:00Z',
                },
            });
            expect(row.capabilities).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        capability_id: 'text.generate',
                        status: 'coming_soon',
                    }),
                ])
            );
        }
    );

    test('missing provider_model_slug -> error flagged', () => {
        const bad = {
            api_model_id: 'z-ai/glm-5.1',
            provider_api_model_id: 'gmicloud:z-ai/glm-5.1',
            provider_model_slug: null,
            internal_model_id: 'z-ai/glm-5.1',
            is_active_gateway: true,
            input_modalities: 'text',
            output_modalities: 'text',
            capabilities: [{ capability_id: 'text.generate', status: 'active', params: [] }],
        };
        const result = checkApiProviderModelEntrySafety(bad, { providerId: 'gmicloud' });
        expect(result.errors).toEqual(
            expect.arrayContaining([expect.stringContaining('missing provider_model_slug')])
        );
    });

    test('disabled unroutable future row may omit unverified provider_model_slug', () => {
        const row = {
            api_model_id: 'qwen/qwen3.8-27b',
            provider_api_model_id: 'cerebras:qwen/qwen3.8-27b',
            internal_model_id: 'qwen/qwen3.8-27b',
            is_active_gateway: false,
            routable: false,
            routing_status: 'disabled',
            capabilities: [{ capability_id: 'text.generate', status: 'disabled', params: [] }],
        };
        const result = checkApiProviderModelEntrySafety(row, { providerId: 'cerebras' });
        expect(result.errors).not.toEqual(
            expect.arrayContaining([expect.stringContaining('missing provider_model_slug')])
        );
    });

    test('active gateway row with active capabilities and missing modalities -> warning', () => {
        const bad = {
            api_model_id: 'deepseek/deepseek-v3.1',
            provider_api_model_id: 'gmicloud:deepseek/deepseek-v3.1',
            provider_model_slug: 'deepseek-ai/DeepSeek-V3.1',
            internal_model_id: 'deepseek/deepseek-v3.1',
            is_active_gateway: true,
            input_modalities: null,
            output_modalities: null,
            capabilities: [{ capability_id: 'text.generate', status: 'active', params: [] }],
        };
        const result = checkApiProviderModelEntrySafety(bad, { providerId: 'gmicloud' });
        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.stringContaining('active on gateway with active capabilities but missing input_modalities and output_modalities'),
            ])
        );
    });

    test('array-valued modalities do not trigger missing-modality warning', () => {
        const good = {
            api_model_id: 'google/gemma-3-27b',
            provider_api_model_id: 'venice-e2ee:google/gemma-3-27b',
            provider_model_slug: 'google/gemma-3-27b',
            internal_model_id: 'google/gemma-3-27b',
            is_active_gateway: true,
            input_modalities: ['text', 'image'],
            output_modalities: ['text'],
            capabilities: [{ capability_id: 'text.generate', status: 'active', params: [] }],
        };
        const result = checkApiProviderModelEntrySafety(good, { providerId: 'venice-e2ee' });
        expect(result.warnings.some((warning) => warning.includes('missing input_modalities'))).toBe(false);
    });

    test('canonical model modalities suppress duplicate provider-row warning', () => {
        const row = {
            api_model_id: 'google/gemma-3-27b',
            provider_api_model_id: 'venice-e2ee:google/gemma-3-27b',
            provider_model_slug: 'google/gemma-3-27b',
            internal_model_id: 'google/gemma-3-27b',
            is_active_gateway: true,
            input_modalities: null,
            output_modalities: null,
            capabilities: [{ capability_id: 'text.generate', status: 'active', params: [] }],
        };
        const result = checkApiProviderModelEntrySafety(row, {
            providerId: 'venice-e2ee',
            fallbackInputModalities: 'text,image,video',
            fallbackOutputModalities: 'text',
        });
        expect(result.warnings.some((warning) => warning.includes('missing input_modalities'))).toBe(false);
    });

    test('active gateway row with no active capabilities -> warning', () => {
        const bad = {
            api_model_id: 'qwen/text-embedding-v3',
            provider_api_model_id: 'alibaba-cloud:qwen/text-embedding-v3',
            provider_model_slug: 'text-embedding-v3',
            internal_model_id: 'qwen/text-embedding-v3',
            is_active_gateway: true,
            input_modalities: null,
            output_modalities: null,
            capabilities: [],
        };
        const result = checkApiProviderModelEntrySafety(bad, { providerId: 'alibaba-cloud' });
        expect(result.warnings).toEqual(
            expect.arrayContaining([expect.stringContaining('active on gateway but has no configured non-disabled capabilities')])
        );
    });

    test('deranked capabilities count as configured and do not trigger no-capability warning', () => {
        const row = {
            api_model_id: 'anthropic/claude-opus-4.5',
            provider_api_model_id: 'venice:anthropic/claude-opus-4.5',
            provider_model_slug: 'claude-opus-4-5',
            internal_model_id: 'anthropic/claude-opus-4.5',
            is_active_gateway: true,
            input_modalities: ['text', 'image'],
            output_modalities: ['text'],
            capabilities: [{ capability_id: 'text.generate', status: 'deranked_lvl2', params: [] }],
        };
        const result = checkApiProviderModelEntrySafety(row, { providerId: 'venice' });
        expect(
            result.warnings.some((warning) => warning.includes('no configured non-disabled capabilities'))
        ).toBe(false);
    });

    test('structured capability params are valid for video metadata', () => {
        const row = {
            api_model_id: 'minimax/hailuo-2.3',
            provider_api_model_id: 'minimax:minimax/hailuo-2.3',
            provider_model_slug: 'MiniMax-Hailuo-2.3',
            internal_model_id: 'minimax/hailuo-2.3',
            is_active_gateway: true,
            input_modalities: ['text', 'image'],
            output_modalities: ['video'],
            capabilities: [{
                capability_id: 'video.generate',
                status: 'active',
                params: {
                    prompt: {},
                    resolution: {
                        type: 'string',
                        values: ['768p', '1080p'],
                        default: '768p',
                    },
                    seconds: {
                        type: 'integer',
                        values: [6, 10],
                    },
                    quality: ['standard', 'pro'],
                },
            }],
        };
        const result = checkApiProviderModelEntrySafety(row, { providerId: 'minimax' });
        expect(result.errors).toEqual([]);
    });

    test('malformed capability params are reported before import', () => {
        const row = {
            api_model_id: 'minimax/hailuo-2.3',
            provider_api_model_id: 'minimax:minimax/hailuo-2.3',
            provider_model_slug: 'MiniMax-Hailuo-2.3',
            internal_model_id: 'minimax/hailuo-2.3',
            is_active_gateway: true,
            input_modalities: ['text'],
            output_modalities: ['video'],
            capabilities: [{
                capability_id: 'video.generate',
                status: 'active',
                params: [
                    'prompt',
                    { provider_min: 1 },
                    123,
                ],
            }],
        };
        const result = checkApiProviderModelEntrySafety(row, { providerId: 'minimax' });
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.stringContaining('params[1] missing param_id'),
                expect.stringContaining('params[2] must be a parameter name string or object'),
            ])
        );
    });

    test('accepts a valid route geographic availability policy', () => {
        const row = {
            provider_api_model_id: 'provider:model',
            api_model_id: 'lab/model',
            provider_model_slug: 'model',
            availability: {
                mode: 'allowlist',
                countries: ['GB', 'US'],
                country_source: 'request_origin',
                unknown_country: 'deny',
                source_url: 'https://example.com/supported-countries',
            },
        };
        expect(checkApiProviderModelEntrySafety(row, { providerId: 'provider' }).errors).toEqual([]);
    });

    test('rejects malformed route geographic availability policies', () => {
        const row = {
            provider_api_model_id: 'provider:model',
            api_model_id: 'lab/model',
            provider_model_slug: 'model',
            availability: {
                mode: 'allowlist',
                countries: ['gb', 'gb'],
                country_source: 'billing_country',
                unknown_country: 'maybe',
            },
        };
        const errors = checkApiProviderModelEntrySafety(row, { providerId: 'provider' }).errors;
        expect(errors).toEqual(expect.arrayContaining([
            expect.stringContaining('availability.country_source'),
            expect.stringContaining('availability.unknown_country'),
            expect.stringContaining('uppercase ISO 3166-1 alpha-2'),
        ]));
    });
});
