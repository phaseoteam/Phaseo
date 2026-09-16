import "server-only";

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

export async function fetchEpochConfidenceIntervals() {
	try {
		const response = await fetch(EPOCH_ECI_DATA_URL, { next: { revalidate: 86_400 }, headers: { "user-agent": "Phaseo benchmark display (https://phaseo.app)" } });
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
