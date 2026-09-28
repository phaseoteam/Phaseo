const COUNT_UNITS = [
	[1e33, "Dc"],
	[1e30, "No"],
	[1e27, "Oc"],
	[1e24, "Sp"],
	[1e21, "Sx"],
	[1e18, "Qi"],
	[1e15, "Qa"],
	[1e12, "T"],
	[1e9, "B"],
	[1e6, "M"],
	[1e3, "K"],
] as const;

export function formatRoundedCount(value: number): string {
	if (!Number.isFinite(value)) return "--";

	for (const [threshold, suffix] of COUNT_UNITS) {
		if (value >= threshold) return `${Math.floor(value / threshold)}${suffix}`;
	}

	return value.toLocaleString();
}
