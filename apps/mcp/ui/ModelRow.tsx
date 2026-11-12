import { useState, type ReactNode } from "react";
import { displayName } from "./ModelListItem";
import {
  cheapestProviderName,
  contextSize,
  headlinePrice,
  modalitySummary,
  perMillion,
  type CardModel,
} from "./model";

export function OrganisationLogo({
  model,
  theme,
}: {
  model: CardModel;
  theme: "light" | "dark";
}) {
  const [failed, setFailed] = useState(false);
  const src = model.logo?.[theme];
  const initial = (model.provider ?? model.name).trim().charAt(0).toUpperCase();
  return (
    <span className="logo" aria-hidden="true">
      {src && !failed ? (
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        initial
      )}
    </span>
  );
}

// One model, laid out like a row in the website's model list: name and Phaseo ID,
// a muted detail line, and input/output prices in a right-hand column.
export function ModelRow({
  model,
  theme,
  leading,
  onOpen,
}: {
  model: CardModel;
  theme: "light" | "dark";
  leading?: ReactNode;
  onOpen?: () => void;
}) {
  const input = perMillion(model, "input");
  const output = perMillion(model, "output");
  const via = cheapestProviderName(model);
  const modalities = modalitySummary(model.inputModalities, model.outputModalities);
  const details = [
    model.contextTokens ? `${contextSize(model.contextTokens)} context` : null,
    modalities,
    via ? `via ${via}` : null,
    model.hasFreeProvider && (input !== null || output !== null) ? "Free option" : null,
  ].filter((item): item is string => Boolean(item));
  const title = (
    <>
      <span className="row-name">{displayName(model)}</span>
      <span className="row-id">{model.id}</span>
    </>
  );
  return (
    <div className={`row${leading ? " with-leading" : ""}`}>
      {leading}
      <OrganisationLogo model={model} theme={theme} />
      <div className="row-main">
        {onOpen ? (
          <button type="button" className="row-title" onClick={onOpen}>
            {title}
          </button>
        ) : (
          <div className="row-title">{title}</div>
        )}
        {details.length > 0 && (
          <div className="row-meta">
            {details.map((item, index) => (
              <span key={item}>
                {index > 0 && <span className="dot" aria-hidden="true">·</span>}
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
      {input === null && output === null ? (
        <div className="row-price-none">
          {model.hasFreeProvider ? "Free" : "Price not listed"}
        </div>
      ) : (
        <dl className="row-price">
          <dt>Input</dt>
          <dd>{headlinePrice(input)}</dd>
          <dt>Output</dt>
          <dd>{headlinePrice(output)}</dd>
          <span className="unit">per 1M tokens</span>
        </dl>
      )}
    </div>
  );
}
