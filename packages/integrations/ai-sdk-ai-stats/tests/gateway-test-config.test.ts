import { describe, expect, it } from 'vitest';
import { resolveGatewayTestConfig } from './gateway-test-config.js';

describe('gateway test config', () => {
  it('disables live gateway access when no API key is present', () => {
    expect(resolveGatewayTestConfig({})).toEqual({
      resolvedApiKey: undefined,
      resolvedBaseUrl: undefined,
      shouldRunGatewayTests: false,
      hasLiveGatewayAccess: false,
    });
  });

  it('disables live gateway access when API key is present but opt-in flag is missing', () => {
    expect(resolveGatewayTestConfig({
      AI_STATS_API_KEY: 'test-key',
    })).toEqual({
      resolvedApiKey: 'test-key',
      resolvedBaseUrl: undefined,
      shouldRunGatewayTests: false,
      hasLiveGatewayAccess: false,
    });
  });

  it('enables live gateway access with AI_STATS env vars when explicitly opted in', () => {
    expect(resolveGatewayTestConfig({
      AI_STATS_API_KEY: 'test-key',
      AI_STATS_BASE_URL: 'https://ai-stats.example/v1',
      AI_STATS_RUN_GATEWAY_TESTS: '1',
    })).toEqual({
      resolvedApiKey: 'test-key',
      resolvedBaseUrl: 'https://ai-stats.example/v1',
      shouldRunGatewayTests: true,
      hasLiveGatewayAccess: true,
    });
  });

  it('enables live gateway access with OPENAI_GATEWAY env vars when explicitly opted in', () => {
    expect(resolveGatewayTestConfig({
      OPENAI_GATEWAY_API_KEY: 'gateway-key',
      OPENAI_GATEWAY_URL: 'https://gateway.example/v1',
      AI_STATS_RUN_GATEWAY_TESTS: '1',
    })).toEqual({
      resolvedApiKey: 'gateway-key',
      resolvedBaseUrl: 'https://gateway.example/v1',
      shouldRunGatewayTests: true,
      hasLiveGatewayAccess: true,
    });
  });

  it('prefers AI_STATS base URL over OPENAI_GATEWAY_URL when both are present', () => {
    expect(resolveGatewayTestConfig({
      AI_STATS_API_KEY: 'test-key',
      AI_STATS_BASE_URL: 'https://ai-stats.example/v1',
      OPENAI_GATEWAY_URL: 'https://gateway.example/v1',
      AI_STATS_RUN_GATEWAY_TESTS: '1',
    })).toEqual({
      resolvedApiKey: 'test-key',
      resolvedBaseUrl: 'https://ai-stats.example/v1',
      shouldRunGatewayTests: true,
      hasLiveGatewayAccess: true,
    });
  });
});
