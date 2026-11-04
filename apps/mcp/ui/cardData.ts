import type { CardModel } from "./model";

export type Estimate = {
  modelId: string;
  modelName?: string;
  providerId: string;
  providerName?: string | null;
  isFree: boolean;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  inputCostUSD: number;
  cachedInputCostUSD: number;
  outputCostUSD: number;
  totalCostUSD: number;
};

export type Credits = {
  balanceNanos: number;
  reservedNanos: number;
  availableNanos: number;
  thirtyDayUsageNanos: number | null;
  thirtyDayRequests: number;
};

export type Card =
  | { kind: "models"; models: CardModel[] }
  | { kind: "estimate"; estimate: Estimate }
  | { kind: "credits"; credits: Credits };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

// Picks the card from the shape of the tool result.
export function cardFor(data: unknown): Card | null {
  if (!isRecord(data)) return null;
  if (Array.isArray(data.models))
    return { kind: "models", models: data.models.filter(isRecord) as CardModel[] };
  if (isRecord(data.estimate) && isNumber(data.estimate.totalCostUSD))
    return { kind: "estimate", estimate: data.estimate as unknown as Estimate };
  if (isRecord(data.credits) && isNumber(data.credits.availableNanos))
    return { kind: "credits", credits: data.credits as unknown as Credits };
  return null;
}
