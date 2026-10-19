const EXECUTION_REGION_LABELS: Record<string, string> = {
	global: "Global",
	us: "US",
	eu: "EU",
	apac: "APAC",
	jp: "Japan",
	au: "Australia",
};

// Execution regions are stored as lowercase codes such as "eu" or "us-central1".
export function formatExecutionRegionLabel(value: string): string {
	const normalized = String(value ?? "").trim().toLowerCase();
	return EXECUTION_REGION_LABELS[normalized] ?? (normalized ? normalized.toUpperCase() : value);
}
