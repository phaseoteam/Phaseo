import { CodexSettings } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { PHASEO_GATEWAY_ENDPOINT } from "./phaseoOAuth.ts";
const decodeConfig = Schema.decodeSync(CodexSettings);

const launchArgs = [
  'model_provider="phaseo"',
  'model_providers.phaseo.name="Phaseo"',
  `model_providers.phaseo.base_url="${PHASEO_GATEWAY_ENDPOINT}"`,
  'model_providers.phaseo.env_key="PHASEO_GATEWAY_TOKEN"',
  'model_providers.phaseo.wire_api="responses"',
  "model_providers.phaseo.requires_openai_auth=false",
  "model_providers.phaseo.supports_websockets=false",
]
  .map((value) => `-c '${value}'`)
  .join(" ");

export function phaseoRuntime(input: {
  binaryPath: string;
  homePath: string;
  key: string;
  enabled: boolean;
  environment: NodeJS.ProcessEnv;
}) {
  const environment: NodeJS.ProcessEnv = {
    ...input.environment,
    CODEX_HOME: input.homePath,
    PHASEO_GATEWAY_TOKEN: input.key,
  };
  delete environment.T3CODE_CODEX_LAUNCH_ARGS;
  delete environment.OPENAI_API_KEY;
  delete environment.OPENAI_BASE_URL;
  delete environment.ACCESS_TOKEN;
  return {
    config: decodeConfig({
      binaryPath: input.binaryPath,
      homePath: input.homePath,
      enabled: input.enabled,
      launchArgs,
    }),
    environment,
    revision: input.key,
  };
}
