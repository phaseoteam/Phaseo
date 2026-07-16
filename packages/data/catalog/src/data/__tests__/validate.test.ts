import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkApiProviderModelEntrySafety, checkPricingEntrySafety, isMajorError } from '@/data/validate';

const DATA_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function readPricingJson(relativePath: string) {
    return JSON.parse(fs.readFileSync(path.join(DATA_ROOT, relativePath), 'utf8'));
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

    test('top-level pricing windows must be persisted on every rule', () => {
        const bad = {
            key: 'p:m:e',
            api_provider_id: 'p',
            model_id: 'm',
            endpoint: 'e',
            effective_to: '2026-05-23T00:00:00Z',
            rules: [
                {
                    meter: 'input_text_tokens',
                    unit_size: 1,
                    price_per_unit: 0.0025,
                },
            ],
        };

        const errs = checkPricingEntrySafety(bad);
        expect(errs).toEqual(
            expect.arrayContaining([
                expect.stringContaining('top-level effective_to must be repeated on every rule'),
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

    test('Google Vertex image model does not advertise flex pricing without executor support', () => {
        const pricing = readPricingJson(
            'pricing/google-vertex/google-gemini-3.1-flash-lite-image/text.generate/pricing.json'
        );
        expect(pricing.rules.some((rule: any) => rule?.pricing_plan === 'flex')).toBe(false);
    });
});

describe('api provider model safety checks', () => {
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
});
