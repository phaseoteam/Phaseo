import { normalizeTableColumns } from "./tablePreferences";
import type { TableColumnPreference, TableDensity } from "./tablePreferences";

export const REQUEST_COLUMNS = [
	{ id: "date", label: "Date" },
	{ id: "models", label: "Models" },
	{ id: "provider", label: "Provider" },
	{ id: "app", label: "App" },
	{ id: "input", label: "Input Tokens", numeric: true },
	{ id: "output", label: "Output Tokens", numeric: true },
	{ id: "cost", label: "Cost", numeric: true },
	{
		id: "speed",
		label: "Speed (tokens)",
		numeric: true,
		description: "Recorded output throughput in tokens per second.",
	},
	{
		id: "overhead",
		label: "Phaseo Overhead",
		numeric: true,
		description:
			"Authentication, validation and routing before the first upstream request. Older requests may not have this measurement.",
	},
	{
		id: "ttft",
		label: "Time to First Token",
		numeric: true,
		description:
			"Provider time to first token for streaming requests; excludes Phaseo routing time.",
	},
	{ id: "finish", label: "Finish Reason" },
	{ id: "key", label: "API Key" },
] as const;

export type RequestColumnId = (typeof REQUEST_COLUMNS)[number]["id"];
export type RequestColumnPreference = TableColumnPreference<RequestColumnId>;
export type RequestTableDensity = TableDensity;
export const REQUEST_DENSITY_STORAGE_KEY = "phaseo.requests.density.v1";
export function normalizeRequestDensity(value: unknown): RequestTableDensity {
	return value === "compact" || value === "expanded" ? value : "regular";
}

export function orderRequestColumns(columns: RequestColumnPreference[]) {
	return [
		...columns.filter(({ pinned }) => pinned),
		...columns.filter(({ pinned }) => !pinned),
	];
}
export const REQUEST_COLUMNS_STORAGE_KEY = "phaseo.requests.columns.v1";
export const defaultRequestColumns = (): RequestColumnPreference[] =>
	REQUEST_COLUMNS.map(({ id }) => ({ id, visible: true }));

export function normalizeRequestColumns(
	value: unknown,
): RequestColumnPreference[] {
	return normalizeTableColumns(value, REQUEST_COLUMNS);
}

export function formatRequestMetric(value: unknown, suffix = ""): string {
	if (value == null || (typeof value === "string" && !value.trim())) return "—";
	const number =
		typeof value === "number" || typeof value === "string"
			? Number(value)
			: NaN;
	return Number.isFinite(number) && number >= 0
		? `${number.toLocaleString("en-US", { maximumFractionDigits: 1 })}${suffix}`
		: "—";
}
