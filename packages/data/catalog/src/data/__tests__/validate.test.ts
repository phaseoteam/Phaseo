import { checkPricingEntrySafety, isMajorError } from '@/data/validate';

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
});

