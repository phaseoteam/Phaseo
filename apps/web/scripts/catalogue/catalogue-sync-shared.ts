export type JsonObject = Record<string, any>;

export type PricingRuleOptions = {
	unit?: string;
	unitSize?: number;
	note?: string | null;
};

export function normalized(value: unknown): string {
	return String(value ?? "").trim().toLowerCase();
}
