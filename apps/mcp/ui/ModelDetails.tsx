import { useEffect, useRef } from "react";
import { contextSize, pricePerMillion, type Model } from "./model";

export function ModelDetails({
  model,
  selected,
  disabled,
  onClose,
  onToggle,
}: {
  model: Model;
  selected: boolean;
  disabled: boolean;
  onClose: () => void;
  onToggle: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => previous?.focus();
  }, []);
  const fields = [
    [
      "Context",
      model.contextTokens === null
        ? "Not listed"
        : `${contextSize(model.contextTokens)} tokens`,
    ],
    [
      "Paid input / 1M tokens",
      `${pricePerMillion(model.inputPricePerToken)}${model.inputPriceProviderId ? ` · ${model.inputPriceProviderId}` : ""}`,
    ],
    [
      "Paid output / 1M tokens",
      `${pricePerMillion(model.outputPricePerToken)}${model.outputPriceProviderId ? ` · ${model.outputPriceProviderId}` : ""}`,
    ],
    ["Free offer", model.hasFreeProvider ? "Available" : "None listed"],
    [
      "Input → output",
      `${model.inputModalities.join(", ")} → ${model.outputModalities.join(", ")}`,
    ],
    ["Tool calling", model.supportsTools ? "Supported" : "Not supported"],
    [
      "Available providers",
      model.availableProviders.join(", ") || "None listed",
    ],
  ];
  return (
    <section
      className="detail"
      aria-label={`${model.name} details`}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <button
        ref={closeButton}
        className="close"
        onClick={onClose}
        aria-label="Close model details"
      >
        ×
      </button>
      <p className="eyebrow">{model.provider ?? "MODEL DETAILS"}</p>
      <h2>{model.name}</h2>
      <code>{model.id}</code>
      <p>{model.description ?? "No description listed."}</p>
      <dl>
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <button disabled={disabled} onClick={onToggle}>
        {selected ? "Remove from comparison" : "Add to comparison"}
      </button>
    </section>
  );
}
