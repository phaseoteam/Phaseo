import { useEffect, useRef } from "react";
import { Check, Plus } from "lucide-react";
import {
  detailPrice,
  exactTokens,
  lifecycleLabel,
  perMillion,
  priceProviderName,
  type CardModel,
} from "./model";
import { IntegrationExamples } from "./IntegrationExamples";
import { ModalityBadge, sortModalities } from "./modality";
import { OrganisationLogo } from "./ModelRow";
import { displayName, priceSummary, providerCounts, releaseDate } from "./ModelListItem";

// A model's page inside the explorer, laid out like the top of the website's model
// page. It replaces the list rather than floating over it: both hosts ask full-screen
// apps not to use floating panels.
export function ModelDetails({
  model,
  theme,
  selected,
  disabled,
  onClose,
  onToggle,
  onUse,
  onLink,
  copied,
  attaching,
}: {
  model: CardModel;
  theme: "light" | "dark";
  selected: boolean;
  disabled: boolean;
  onClose: () => void;
  onToggle: () => void;
  onUse: () => void;
  onLink: () => void;
  copied: boolean;
  attaching: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    heading.current?.focus();
    return () => previous?.focus();
  }, []);
  const input = perMillion(model, "input");
  const output = perMillion(model, "output");
  const providers = providerCounts(model);
  const released = releaseDate(model.releaseDate);
  // Each side's lowest price can come from a different provider, so name both.
  const priced = (value: number | null, side: "input" | "output") => {
    if (value === null) return "Not listed";
    const provider = priceProviderName(model, side);
    return `${detailPrice(value)} / 1M tokens${provider ? ` · ${provider}` : ""}`;
  };
  const fields: Array<[string, string]> = [
    ["Status", lifecycleLabel(model.lifecycleStatus)],
    ["Context length", exactTokens(model.contextTokens)],
    ["Input price", priced(input, "input")],
    ["Output price", priced(output, "output")],
    ["Free offer", model.hasFreeProvider ? "Available" : "None listed"],
    ["Tool calling", model.supportsTools ? "Supported" : "Not supported"],
    ["Providers", model.availableProviders.join(", ") || "None listed"],
    ["Gateway", model.gatewayAvailable ? "Available" : "Not available"],
    ["Released", released ?? "Unknown"],
  ];
  const price = priceSummary(model);
  return (
    <article
      className="model-page"
      aria-label={`${model.name} details`}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header className="model-page-head">
        <OrganisationLogo model={model} theme={theme} />
        <div className="model-title">
          <h1 ref={heading} tabIndex={-1}>
            {displayName(model)}
          </h1>
          <span className="model-id">{model.id}</span>
        </div>
      </header>
      {model.description && <p className="model-description">{model.description}</p>}
      <div className="chip-rail">
        {price && (
          <span className="chip">
            <strong>{price}</strong>
          </span>
        )}
        {providers.listed > 0 && (
          <span className="chip">
            Providers <strong>{providers.active}/{providers.listed}</strong>
          </span>
        )}
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
          <dd>{sortModalities(model.inputModalities).map((value) => <ModalityBadge key={value} value={value} />)}</dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd>{sortModalities(model.outputModalities).map((value) => <ModalityBadge key={value} value={value} />)}</dd>
        </div>
      </dl>
      <div className="button-row">
        <button
          type="button"
          className={selected ? undefined : "primary"}
          disabled={disabled}
          aria-pressed={selected}
          onClick={onToggle}
        >
          {selected ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {selected ? "In your shortlist" : "Add to shortlist"}
        </button>
        <button type="button" disabled={attaching} onClick={onUse}>
          Add to chat
        </button>
        <button type="button" onClick={onLink}>
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
      <section className="section">
        <h2>Details</h2>
        <dl className="detail-list">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <IntegrationExamples model={model} />
    </article>
  );
}
