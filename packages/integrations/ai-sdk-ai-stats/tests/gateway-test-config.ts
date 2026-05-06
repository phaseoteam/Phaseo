export type GatewayTestConfig = {
  resolvedApiKey?: string;
  resolvedBaseUrl?: string;
  shouldRunGatewayTests: boolean;
  hasLiveGatewayAccess: boolean;
};

type EnvLike = Record<string, string | undefined>;

export function resolveGatewayTestConfig(env: EnvLike = process.env): GatewayTestConfig {
  const resolvedApiKey = env.AI_STATS_API_KEY || env.OPENAI_GATEWAY_API_KEY;
  const resolvedBaseUrl = env.AI_STATS_BASE_URL || env.OPENAI_GATEWAY_URL;
  const shouldRunGatewayTests = env.AI_STATS_RUN_GATEWAY_TESTS === '1';

  return {
    resolvedApiKey,
    resolvedBaseUrl,
    shouldRunGatewayTests,
    hasLiveGatewayAccess: !!resolvedApiKey && shouldRunGatewayTests,
  };
}
