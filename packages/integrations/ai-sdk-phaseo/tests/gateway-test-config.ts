export type GatewayTestConfig = {
  resolvedApiKey?: string;
  resolvedBaseUrl?: string;
  shouldRunGatewayTests: boolean;
  hasLiveGatewayAccess: boolean;
};

type EnvLike = Record<string, string | undefined>;

export function resolveGatewayTestConfig(env: EnvLike = process.env): GatewayTestConfig {
  const resolvedApiKey = env.PHASEO_API_KEY;
  const resolvedBaseUrl = env.PHASEO_BASE_URL;
  const shouldRunGatewayTests = env.PHASEO_RUN_GATEWAY_TESTS === '1';

  return {
    resolvedApiKey,
    resolvedBaseUrl,
    shouldRunGatewayTests,
    hasLiveGatewayAccess: !!resolvedApiKey && shouldRunGatewayTests,
  };
}
