import { CalendarClock, Check, Plus, TriangleAlert } from "lucide-react";
import type { MouseEvent } from "react";
import { OrganisationLogo } from "./ModelRow";
import { ModalityBadge, sortModalities } from "./modality";
import { headlinePrice, perMillion, type CardModel } from "./model";

// One model, built like a card in the website's model list
// (apps/web/src/components/(data)/models/Models/ModelCard.tsx): logo tile,
// "Organisation: Model" with the Phaseo ID, a row of summary chips, the input and
// output modality badges, and the release date. The website's "open" arrow becomes
// the shortlist toggle; the row itself opens the model.

export function displayName(model: CardModel): string {
  const provider = model.provider?.trim();
  if (!provider || model.name.toLowerCase().startsWith(provider.toLowerCase())) return model.name;
  return `${provider}: ${model.name}`;
}

export function priceSummary(model: CardModel): string | null {
  const input = perMillion(model, "input");
  const output = perMillion(model, "output");
  if (input !== null && output !== null)
    return `${headlinePrice(input)} in · ${headlinePrice(output)} out / 1M tokens`;
  if (input !== null) return `${headlinePrice(input)} in / 1M tokens`;
  if (output !== null) return `${headlinePrice(output)} out / 1M tokens`;
  return model.hasFreeProvider ? "Free" : null;
}

export function providerCounts(model: CardModel): { active: number; listed: number } {
  const support = model.providerSupport;
  if (support?.length)
    return {
      active: support.filter((item) => !item.status || item.status === "active").length,
      listed: support.length,
    };
  return { active: model.availableProviders.length, listed: model.availableProviders.length };
}

export function releaseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(time);
}

function comingSoon(model: CardModel): boolean {
  const support = model.providerSupport ?? [];
  return (
    support.length > 0 &&
    !support.some((item) => item.status === "active") &&
    support.some((item) => item.status === "coming_soon")
  );
}

export function ModelListItem({
  model,
  theme,
  selected,
  selectDisabled,
  onToggle,
  onOpen,
}: {
  model: CardModel;
  theme: "light" | "dark";
  selected: boolean;
  selectDisabled: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const name = displayName(model);
  const price = priceSummary(model);
  const providers = providerCounts(model);
  const released = releaseDate(model.releaseDate);
  const lifecycle = model.lifecycleStatus === "deprecated" || model.lifecycleStatus === "retired"
    ? model.lifecycleStatus
    : null;
  const inputs = sortModalities(model.inputModalities);
  const outputs = sortModalities(model.outputModalities);
  // Like the website, a click anywhere on the row opens the model, except on its controls.
  const openFromRow = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, a")) return;
    onOpen();
  };
  return (
    <article className="model-item" data-selected={selected || undefined} onClick={openFromRow}>
      <div className="model-head">
        <OrganisationLogo model={model} theme={theme} />
        <div className="model-title">
          <button type="button" className="model-name" data-model-id={model.id} onClick={onOpen}>
            {name}
          </button>
          <span className="model-id">{model.id}</span>
        </div>
        <button
          type="button"
          className="icon-button shortlist-toggle"
          aria-pressed={selected}
          aria-label={selected ? `Remove ${model.name} from the shortlist` : `Add ${model.name} to the shortlist`}
          title={selected ? "Remove from shortlist" : selectDisabled ? "Shortlist is full (3 models)" : "Add to shortlist"}
          disabled={!selected && selectDisabled}
          onClick={onToggle}
        >
          {selected ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
        </button>
      </div>
      <div className="chip-rail" aria-label="Model summary">
        {comingSoon(model) && (
          <span className="chip chip-info">
            <CalendarClock aria-hidden="true" />
            Coming soon
          </span>
        )}
        {price && (
          <span className="chip">
            <strong>{price}</strong>
          </span>
        )}
        {lifecycle ? (
          <span className={`chip chip-${lifecycle === "retired" ? "danger" : "warning"}`}>
            <TriangleAlert aria-hidden="true" />
            {lifecycle === "retired" ? "Retired" : "Deprecated"}
          </span>
        ) : providers.listed > 0 ? (
          <span className="chip">
            Providers <strong>{providers.active}/{providers.listed}</strong>
          </span>
        ) : null}
        {model.contextTokens ? (
          <span className="chip">
            Context length{" "}
            <strong>{new Intl.NumberFormat("en-US").format(model.contextTokens)} tokens</strong>
          </span>
        ) : null}
      </div>
      <dl className="modality-rows">
        <div>
          <dt>Input</dt>
          <dd>{inputs.length ? inputs.map((value) => <ModalityBadge key={value} value={value} />) : "–"}</dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd>{outputs.length ? outputs.map((value) => <ModalityBadge key={value} value={value} />) : "–"}</dd>
        </div>
      </dl>
      <div className="model-foot">
        <span>{released ?? "Release date unknown"}</span>
        {model.gatewayAvailable ? <span>On the Gateway</span> : <span>Not on the Gateway</span>}
      </div>
    </article>
  );
}
