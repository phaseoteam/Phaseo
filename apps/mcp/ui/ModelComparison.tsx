import { contextSize, headlinePrice, perMillion, type CardModel } from "./model";
import { ModalityBadge, sortModalities } from "./modality";
import { OrganisationLogo } from "./ModelRow";
import { displayName, providerCounts, releaseDate } from "./ModelListItem";
import type { ReactNode } from "react";

const rows: Array<[string, (model: CardModel) => ReactNode]> = [
  ["Input price", (model) => {
    const value = perMillion(model, "input");
    return value === null ? "Not listed" : `${headlinePrice(value)} / 1M tokens`;
  }],
  ["Output price", (model) => {
    const value = perMillion(model, "output");
    return value === null ? "Not listed" : `${headlinePrice(value)} / 1M tokens`;
  }],
  ["Context length", (model) => (model.contextTokens === null ? "Not listed" : `${contextSize(model.contextTokens)} tokens`)],
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
