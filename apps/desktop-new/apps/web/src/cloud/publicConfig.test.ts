import { afterEach, expect, it, vi } from "vite-plus/test";
import { hasCloudPublicConfig, resolveCloudPublicConfig } from "./publicConfig.ts";
afterEach(() => vi.unstubAllEnvs());
it("cannot enable T3 hosted services through environment configuration", () => {
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
  vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "t3-relay");
  vi.stubEnv("VITE_T3CODE_RELAY_URL", "https://relay.example.test");
  expect(hasCloudPublicConfig()).toBe(false);
  expect(resolveCloudPublicConfig().relayUrl).toBeNull();
});
