import type { Endpoint } from "../../src/core/types";
import type { PriceCard, PriceRule, PricingBreakdownLine, Condition } from "../../src/pipeline/pricing/types";

export type { Endpoint, Condition };

export type CLIOptions = {
    provider?: string[];
    model?: string[];
    endpoint?: Endpoint;
    limit: number;
    runs: number;
    randomize: boolean;
    plan: string;
    min: number;
    max: number;
    seed: number;
    verbose: boolean;
    includeInactive: boolean;
    debug: boolean;
};

export type Combo = {
    provider: string;
    model: string;
    endpoint: Endpoint;
};

export type SimulationRun = {
    combo: Combo;
    plan: string;
    usage: Record<string, number>;
    context: Record<string, any>;
    card: PriceCard;
    estimation: EstimationResult;
    engineTotalUsd: number;
    engineTotalUsdStr: string;
    engineTotalNanos: number;
    diffUsd: number;
    diffNanos: number;
    breakdown: PricingBreakdownLine[];
};

export type AppState =
    | { status: "loading"; message: string }
    | { status: "done"; runs: SimulationRun[]; options: CLIOptions }
    | { status: "error"; error: Error };

export type TabularTable = {
    setHeaders(headers: Array<string | { content: string }>): void;
    addRow(cells: Array<string | number>): void;
    toString(): string;
};

export type RuleSummary = {
    meter: string;
    pricePerUnit: string;
    unitSize: number;
    ruleId?: string;
    conditions: Condition[];
};

export type EstimationLine = {
    meter: string;
    quantity: number;
    unitSize: number;
    billableUnits: number;
    pricePerUnit: string;
    lineCostUsd: string;
    lineCostNanos: number;
    ruleId?: string;
};

export type EstimationResult = {
    totalUsd: number;
    totalUsdStr: string;
    totalNanos: number;
    lines: EstimationLine[];
    ruleSummaries: RuleSummary[];
};

