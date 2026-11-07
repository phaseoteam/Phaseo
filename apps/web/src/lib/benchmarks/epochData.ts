
const EPOCH_ECI_DATA_URL = "https://epoch.ai/data/eci_scores.csv";

export function epochModelKey(value: string) {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCsv(input: string) {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let index = 0; index < input.length; index += 1) {
		const character = input[index];
		if (quoted) {
			if (character === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
			else if (character === '"') quoted = false;
			else field += character;
		} else if (character === '"') quoted = true;
		else if (character === ",") { row.push(field); field = ""; }
		else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
		else field += character;
	}
	return rows;
}

type EpochIntervals = Record<string, { low: number; high: number }>;

// Every model page needs these intervals, and parsing the CSV took about a sixth of a model page's
// render CPU. Next cached this for hours; keep the parsed result per isolate the same way. Only a
// settled value is kept (never an in-flight promise, which another request's I/O would hang on).
const INTERVALS_TTL_MS = 6 * 60 * 60 * 1000;
let cachedIntervals: { at: number; value: EpochIntervals } | null = null;

export async function fetchEpochConfidenceIntervals(): Promise<EpochIntervals> {
	if (cachedIntervals && Date.now() - cachedIntervals.at < INTERVALS_TTL_MS) return cachedIntervals.value;
	const value = await loadEpochConfidenceIntervals();
	if (Object.keys(value).length) cachedIntervals = { at: Date.now(), value };
	return value;
}

async function loadEpochConfidenceIntervals(): Promise<EpochIntervals> {
	try {
		const response = await fetch(EPOCH_ECI_DATA_URL, { cf: { cacheTtl: 86_400, cacheEverything: true }, headers: { "user-agent": "Phaseo benchmark display (https://phaseo.app)" } });
		if (!response.ok) return {};
		const [headers = [], ...rows] = parseCsv(await response.text());
		const nameIndex = headers.indexOf("Display name");
		const modelIndex = headers.indexOf("Model");
		const lowIndex = headers.indexOf("eci_ci_low");
		const highIndex = headers.indexOf("eci_ci_high");
		return Object.fromEntries(rows.flatMap((row) => {
			const name = row[nameIndex] || row[modelIndex];
			const low = Number(row[lowIndex]);
			const high = Number(row[highIndex]);
			return name && Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > low
				? [[epochModelKey(name), { low, high }]]
				: [];
		}));
	} catch {
		return {};
	}
}
