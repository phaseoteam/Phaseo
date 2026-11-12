import {
  detailPrice,
  exactTokens,
  lifecycleLabel,
  perMillion,
  priceProviderName,
  type CardModel,
} from "./model";
import { ModalityBadge, sortModalities } from "./modality";
import { OrganisationLogo } from "./ModelRow";
import { displayName, providerCounts, releaseDate } from "./ModelListItem";
import type { ReactNode } from "react";

function priced(model: CardModel, side: "input" | "output"): ReactNode {
  const value = perMillion(model, side);
  if (value === null) return "Not listed";
  const provider = priceProviderName(model, side);
  return (
    <>
      {detailPrice(value)} / 1M tokens
      {provider && <small>{provider}</small>}
    </>
  );
}

const rows: Array<[string, (model: CardModel) => ReactNode]> = [
  ["Input price", (model) => priced(model, "input")],
  ["Output price", (model) => priced(model, "output")],
  ["Context length", (model) => exactTokens(model.contextTokens)],
  ["Status", (model) => lifecycleLabel(model.lifecycleStatus)],
  ["Input", (model) => <span className="badge-list">{sortModalities(model.inputModalities).map((value) => <ModalityBadge key={value} value={value} />)}</span>],
  ["Output", (model) => <span className="badge-list">{sortModalities(model.outputModalities).map((value) => <ModalityBadge key={value} value={value} />)}</span>],
  ["Tool calling", (model) => (model.supportsTools ? "Supported" : "Not supported")],
  ["Free offer", (model) => (model.hasFreeProvider ? "Available" : "None listed")],
  ["Providers", (model) => {
    const counts = providerCounts(model);
    return counts.listed ? `${counts.active} of ${counts.listed} active` : "None listed";
  }],
  ["Released", (model) => releaseDate(model.releaseDate) ?? "Unknown"],
];

export function ModelComparison({ models, theme }: { models: CardModel[]; theme: "light" | "dark" }) {
  return (
    <div className="table-scroll">
      <table className="compare-table">
        <caption className="sr-only">Selected model comparison</caption>
        <thead>
          <tr>
            <td />
            {models.map((model) => (
              <th scope="col" key={model.id}>
                <span className="compare-head">
                  <OrganisationLogo model={model} theme={theme} />
                  <span className="model-title">
                    <span className="compare-name">{displayName(model)}</span>
                    <span className="model-id">{model.id}</span>
                  </span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, format]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {models.map((model) => (
                <td key={model.id}>{format(model)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        The lowest input and output prices can come from different providers. The
        estimate below uses one provider's prices.
      </p>
    </div>
  );
}
