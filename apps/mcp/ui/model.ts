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
