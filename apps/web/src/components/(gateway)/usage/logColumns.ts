import type { TableColumnDefinition } from "./tablePreferences";

export const UPSTREAM_COLUMNS = [
	{ id: "date", label: "Date" },
	{ id: "model", label: "Model" },
	{ id: "provider", label: "Final Provider" },
	{ id: "generation", label: "Generation ID" },
	{ id: "status", label: "Status Code" },
	{ id: "attempts", label: "Attempts", numeric: true },
	{
		id: "latency",
		label: "Latency",
		numeric: true,
		description:
			"Recorded generation latency to first response, including routing. Not total streaming duration.",
	},
] as const satisfies readonly TableColumnDefinition[];

export const SESSION_COLUMNS = [
	{ id: "date", label: "Date" },
	{ id: "session", label: "Session ID" },
	{ id: "app", label: "App" },
	{
		id: "primary",
		label: "Primary Model",
		description:
			"Most-used model by request count in the selected period. Ties use model ID order.",
	},
	{
		id: "provider",
		label: "Primary Provider",
		description:
			"Most-used provider for the primary model in the selected period.",
	},
	{ id: "other", label: "Other Models" },
	{ id: "requests", label: "Requests", numeric: true },
	{ id: "cost", label: "Cost", numeric: true },
] as const satisfies readonly TableColumnDefinition[];

export const JOB_COLUMNS = [
	{ id: "date", label: "Date" },
	{ id: "model", label: "Model" },
	{ id: "provider", label: "Provider" },
	{ id: "status", label: "Status" },
	{ id: "cost", label: "Cost", numeric: true },
] as const satisfies readonly TableColumnDefinition[];

export const REALTIME_COLUMNS = [
	{ id: "date", label: "Date", description: "Session start time in UTC." },
	{ id: "session", label: "Session ID" },
	{ id: "model", label: "Model" },
	{ id: "provider", label: "Provider" },
	{ id: "voice", label: "Voice" },
	{ id: "status", label: "Status" },
	{ id: "duration", label: "Duration" },
	{ id: "charged", label: "Charged", numeric: true },
	{ id: "held", label: "Held", numeric: true },
] as const satisfies readonly TableColumnDefinition[];
