import { contextSize, pricePerMillion, type Model } from "./model";

const rows: Array<[string, (model: Model) => string]> = [
  ["Context", (model) => contextSize(model.contextTokens)],
  [
    "Paid input / 1M tokens",
    (model) => pricePerMillion(model.inputPricePerToken),
  ],
  [
    "Paid output / 1M tokens",
    (model) => pricePerMillion(model.outputPricePerToken),
  ],
  [
    "Free offer",
    (model) => (model.hasFreeProvider ? "Available" : "None listed"),
  ],
  [
    "Input modalities",
    (model) => model.inputModalities.join(", ") || "Not listed",
  ],
  [
    "Output modalities",
    (model) => model.outputModalities.join(", ") || "Not listed",
  ],
  [
    "Tool calling",
    (model) => (model.supportsTools ? "Supported" : "Not supported"),
  ],
  [
    "Available providers",
    (model) => model.availableProviders.join(", ") || "None listed",
  ],
];

export function ModelComparison({ models }: { models: Model[] }) {
  return (
    <div className="table-scroll">
      <table>
        <caption className="sr-only">Selected model comparison</caption>
        <thead>
          <tr>
            <th scope="col">Capability</th>
            {models.map((model) => (
              <th scope="col" key={model.id}>
                {model.name}
                <small>{model.provider}</small>
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
        Lowest listed paid input and output prices may come from different
        providers. Workload estimates below use one provider offer.
      </p>
    </div>
  );
}
