export type Model = {
  id: string;
  name: string;
  description: string | null;
  provider: string | null;
  contextTokens: number | null;
  inputModalities: string[];
  outputModalities: string[];
  inputPricePerToken: string | null;
  outputPricePerToken: string | null;
  supportsTools: boolean;
  availableProviders: string[];
  inputPriceProviderId?: string | null;
  outputPriceProviderId?: string | null;
  hasFreeProvider?: boolean;
  gatewayAvailable?: boolean;
  supportedEndpoints?: string[];
};

export function pricePerMillion(value: string | null): string {
  if (value === null || value.trim() === "") return "Not listed";
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0) return "Not listed";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(rate * 1_000_000);
}

export function contextSize(value: number | null): string {
  return value === null
    ? "Not listed"
    : new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
}

export type ModelLogo = { light: string; dark: string };

// Fields the cards read on top of Model. All optional so older results still render.
export type CardModel = Model & {
  logo?: ModelLogo | null;
  modelUrl?: string;
  inputPricePerMillion?: number | null;
  outputPricePerMillion?: number | null;
  providerSupport?: Array<{ providerId: string; providerName: string | null }>;
};

// Matches the website's model list: cents for fractional amounts, bare integers, and
// three significant digits below a cent so small rates never look free.
export function headlinePrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0)
    return "Not listed";
  if (value === 0) return "$0";
  if (value < 0.01)
    return `$${new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 }).format(value)}`;
  const integer = Math.abs(value - Math.round(value)) < 1e-9;
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: integer ? 0 : 2,
    maximumFractionDigits: integer ? 0 : 3,
  }).format(value)}`;
}

// Money totals: two decimals, with three significant digits below a cent.
export function money(value: number): string {
  if (!Number.isFinite(value)) return "Not available";
  if (value > 0 && value < 0.01)
    return `$${new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 }).format(value)}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function tokenCount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function modalityLabel(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

export function modalitySummary(input: string[], output: string[]): string | null {
  if (!input.length && !output.length) return null;
  return `${input.map(modalityLabel).join(", ") || "Any"} → ${output.map(modalityLabel).join(", ") || "Any"}`;
}

export function perMillion(model: CardModel, side: "input" | "output"): number | null {
  const direct = side === "input" ? model.inputPricePerMillion : model.outputPricePerMillion;
  if (direct !== undefined && direct !== null) return direct;
  const raw = side === "input" ? model.inputPricePerToken : model.outputPricePerToken;
  if (raw === null || raw.trim() === "") return null;
  const rate = Number(raw);
  return Number.isFinite(rate) && rate >= 0 ? rate * 1_000_000 : null;
}

export function cheapestProviderName(model: CardModel): string | null {
  const id = model.inputPriceProviderId ?? model.outputPriceProviderId;
  if (!id) return null;
  return model.providerSupport?.find((item) => item.providerId === id)?.providerName ?? id;
}
