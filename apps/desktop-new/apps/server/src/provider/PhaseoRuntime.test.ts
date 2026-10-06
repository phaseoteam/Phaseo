import { expect, it } from "vite-plus/test";
import { codexAppServerArgs } from "./Layers/codexLaunchArgs.ts";
import { phaseoRuntime } from "./PhaseoRuntime.ts";

it("routes the Codex harness to Phaseo without exposing tokens in arguments or using ambient accounts", () => {
  const runtime = phaseoRuntime({
    binaryPath: "/codex",
    homePath: "/isolated/phaseo",
    key: "fixture-secret",
    enabled: true,
    environment: {
      OPENAI_API_KEY: "foreign",
      OPENAI_BASE_URL: "https://foreign.example",
      ACCESS_TOKEN: "foreign",
      T3CODE_CODEX_LAUNCH_ARGS: "--config evil=true",
      PATH: "/bin",
    },
  });
  expect(runtime.environment).toEqual({
    CODEX_HOME: "/isolated/phaseo",
    PHASEO_GATEWAY_TOKEN: "fixture-secret",
    PATH: "/bin",
  });
  const args = codexAppServerArgs(runtime.config.launchArgs);
  expect(args).toContain('model_provider="phaseo"');
  expect(args).toContain('model_providers.phaseo.base_url="https://api.phaseo.app/v1"');
  expect(args).toContain('model_providers.phaseo.wire_api="responses"');
  expect(args.join(" ")).not.toContain("fixture-secret");
  expect(args.join(" ")).not.toContain("evil");
});
