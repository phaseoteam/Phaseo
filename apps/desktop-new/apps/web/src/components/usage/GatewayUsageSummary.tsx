import type { GatewayUsage, UsageSummary } from "@t3tools/contracts";
import { formatCount, formatTokens, formatUsd } from "@t3tools/shared/usageFormat";

export function gatewaySources(summaries: readonly (Pick<UsageSummary, "gatewayUsage"> | null)[]) {
  const sources = new Map<string, GatewayUsage>();
  for (const summary of summaries) {
    for (const source of summary?.gatewayUsage ?? []) {
      const previous = sources.get(source.sourceId);
      if (!previous || source.readAt > previous.readAt) sources.set(source.sourceId, source);
    }
  }
  return [...sources.values()];
}

export function GatewayUsageSummary({ sources, nativeTokens }: {
  sources: readonly GatewayUsage[]; nativeTokens: number;
}) {
  if (!sources.length) return null;
  const available = sources.filter(source => source.status !== "failed");
  const tokens = available.reduce((sum, source) => sum + source.inputTokens + source.outputTokens, 0);
  const charged = available.reduce((sum, source) => sum + source.chargedUsd, 0);
  const requests = available.reduce((sum, source) => sum + source.requests, 0);
  return <section className="mb-6 border-b border-border pb-5">
    <h2 className="text-sm font-medium">Phaseo gateway</h2>
    {available.length ? <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm tabular-nums">
      <span>{formatUsd(charged)} charged</span>
      <span>{formatTokens(tokens)} gateway tokens</span>
      <span>{formatCount(requests)} requests</span>
      <span>{formatTokens(tokens + nativeTokens)} tokens including local usage</span>
    </div> : null}
    <p className="mt-2 text-xs text-muted-foreground">Usage for connected desktop keys. Gateway charges are separate from local API estimates.</p>
    {sources.some(source => source.status === "failed") ? <p className="mt-2 text-xs text-muted-foreground">Gateway usage is unavailable. Local usage remains available.</p> : null}
    {sources.some(source => source.status === "cached") ? <p className="mt-2 text-xs text-muted-foreground">Showing cached gateway usage.</p> : null}
    {sources.some(source => source.status === "partial") ? <p className="mt-2 text-xs text-muted-foreground">Gateway totals are partial; some usage is missing or the request limit was reached.</p> : null}
  </section>;
}
