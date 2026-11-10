import { useState } from "react";
import { bridge } from "./bridge";
import { ModelRow } from "./ModelRow";
import { money, tokenCount, type CardModel } from "./model";
import type { Credits, Estimate } from "./cardData";

export { cardFor } from "./cardData";

// Inline cards follow ChatGPT's card guidance: no tabs or drill-ins, at most two
// actions, and the full explorer only when the user asks for it.

const MAX_CARD_MODELS = 5;
const USAGE_URL = "https://phaseo.app/gateway/usage";

export function ModelsCard({
  models,
  theme,
  canExpand,
  onExpand,
}: {
  models: CardModel[];
  theme: "light" | "dark";
  canExpand: boolean;
  onExpand: (compare: CardModel[] | null) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const shown = models.slice(0, MAX_CARD_MODELS);
  const expand = async (compare: CardModel[] | null) => {
    setBusy(true);
    try {
      await onExpand(compare);
    } finally {
      setBusy(false);
    }
  };
  if (!shown.length)
    return (
      <section className="card">
        <p className="card-empty">No models matched these filters.</p>
      </section>
    );
  return (
    <section className="card" aria-label="Phaseo models">
      <div className="rows">
        {shown.map((model) => (
          <ModelRow key={model.id} model={model} theme={theme} />
        ))}
      </div>
      {canExpand && (
        <div className="card-actions">
          {shown.length > 1 && (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void expand(shown.slice(0, 3))}
            >
              Compare these
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => void expand(null)}>
            Open explorer
          </button>
          {models.length > shown.length && (
            <span className="card-note">
              {models.length - shown.length} more in the explorer
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function rate(cost: number, tokens: number): string {
  const perMillion = (cost / tokens) * 1_000_000;
  return money(perMillion).replace(/\.00$/, "");
}

export function EstimateCard({ estimate }: { estimate: Estimate }) {
  const lines: Array<[string, number]> = [];
  if (estimate.inputTokens > 0)
    lines.push([
      `Input · ${tokenCount(estimate.inputTokens)} × ${rate(estimate.inputCostUSD, estimate.inputTokens)}`,
      estimate.inputCostUSD,
    ]);
  if (estimate.cachedInputTokens > 0)
    lines.push([
      `Cached input · ${tokenCount(estimate.cachedInputTokens)} × ${rate(estimate.cachedInputCostUSD, estimate.cachedInputTokens)}`,
      estimate.cachedInputCostUSD,
    ]);
  if (estimate.outputTokens > 0)
    lines.push([
      `Output · ${tokenCount(estimate.outputTokens)} × ${rate(estimate.outputCostUSD, estimate.outputTokens)}`,
      estimate.outputCostUSD,
    ]);
  const provider = estimate.providerName ?? estimate.providerId;
  return (
    <section className="card" aria-label="Phaseo cost estimate">
      <div className="stat">
        <div className="stat-label">
          {estimate.modelName ?? estimate.modelId} · {tokenCount(estimate.inputTokens)} in,{" "}
          {tokenCount(estimate.outputTokens)} out
        </div>
        <div className="stat-value">{estimate.isFree ? "Free" : money(estimate.totalCostUSD)}</div>
      </div>
      {lines.length > 0 && (
        <dl className="lines">
          {lines.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{money(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="card-foot">
        Listed rates per 1M tokens via {provider}. An estimate; billing may differ.
      </p>
    </section>
  );
}

export function CreditsCard({ credits }: { credits: Credits }) {
  const lines: Array<[string, string]> = [
    ["Requests, last 30 days", new Intl.NumberFormat("en-US").format(credits.thirtyDayRequests)],
  ];
  if (credits.thirtyDayUsageNanos !== null)
    lines.push(["Spend, last 30 days", money(credits.thirtyDayUsageNanos / 1e9)]);
  if (credits.reservedNanos > 0)
    lines.push(["Reserved for running requests", money(credits.reservedNanos / 1e9)]);
  return (
    <section className="card" aria-label="Phaseo credits">
      <div className="stat">
        <div className="stat-label">Credit balance</div>
        <div className="stat-value">{money(credits.availableNanos / 1e9)}</div>
      </div>
      <dl className="lines">
        {lines.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="card-actions">
        <button
          type="button"
          onClick={() => void bridge.openLink({ url: USAGE_URL }).catch(() => undefined)}
        >
          Open usage
        </button>
      </div>
    </section>
  );
}
