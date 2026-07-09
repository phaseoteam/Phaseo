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
      PHASEO_API_KEY: 'test-key',
    })).toEqual({
      resolvedApiKey: 'test-key',
      resolvedBaseUrl: undefined,
      shouldRunGatewayTests: false,
      hasLiveGatewayAccess: false,
    });
  });

  it('enables live gateway access with Phaseo env vars when explicitly opted in', () => {
    expect(resolveGatewayTestConfig({
      PHASEO_API_KEY: 'test-key',
      PHASEO_BASE_URL: 'https://phaseo.example/v1',
      PHASEO_RUN_GATEWAY_TESTS: '1',
    })).toEqual({
      resolvedApiKey: 'test-key',
      resolvedBaseUrl: 'https://phaseo.example/v1',
      shouldRunGatewayTests: true,
      hasLiveGatewayAccess: true,
    });
  });
});
