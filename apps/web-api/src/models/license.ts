// Catalogue licences are free text, so the same licence arrives under several
// spellings. Filters group on one label per licence.
const LICENSE_ALIASES: Record<string, string> = {
	"apache 2.0": "Apache 2.0",
	"apache-2.0": "Apache 2.0",
	"apache license 2.0": "Apache 2.0",
	"apache license, version 2.0": "Apache 2.0",
	"gemma license": "Gemma",
	"mit": "MIT",
	"mit license": "MIT",
	"openmdw license agreement 1.1": "OpenMDW-1.1",
	"proprietary": "Proprietary",
};

const UNKNOWN_LICENSES = new Set(["unknown", "n/a", "na", "-", "tbd", "none"]);

export function normalizeModelLicense(value: unknown): string | null {
	const raw = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
	const lower = raw.toLowerCase();
	if (!raw || UNKNOWN_LICENSES.has(lower)) return null;
	// Filters keep selections in a comma-separated URL parameter.
	return LICENSE_ALIASES[lower] ?? raw.replace(/\s*,\s*/g, " ");
}
