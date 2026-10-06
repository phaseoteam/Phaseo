import { expect, it } from "vite-plus/test";
import type { GatewayUsage } from "@t3tools/contracts";
import { gatewaySources } from "./GatewayUsageSummary";
it("uses the newest shared gateway source once across environments", () => {
  const source: GatewayUsage = { sourceId: "workspace:key", label: "Phaseo", status: "ok", inputTokens: 10, outputTokens: 2, chargedUsd: 1, requests: 1, missingUsage: 0, readAt: "2026-10-06T10:00:00Z" };
  const summary = (value: GatewayUsage) => ({ gatewayUsage: [value] });
  const latest = { ...source, inputTokens: 20, readAt: "2026-10-06T11:00:00Z" };
  expect(gatewaySources([summary(source), null, summary(latest), summary(source)])).toEqual([latest]);
  expect(gatewaySources([summary(source), summary({ ...source, sourceId: "another:key" })])).toHaveLength(2);
});
