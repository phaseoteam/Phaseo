const DEFAULT_PASTELS = [
	"#A7C7E7",
	"#F7C5CC",
	"#C1E5C0",
	"#F8D7A9",
	"#D4C2FC",
	"#FFE3A3",
	"#BFE3F2",
	"#FFD0E1",
	"#C8F0DD",
	"#FBE2B4",
];

const GOLDEN_ANGLE = 137.508;

function hash32(str: string) {
	let h = 0x811c9dc5 >>> 0;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
	}
	return h >>> 0;
}

export function keyForSeries(value: string) {
	const safe = value.replace(/[^a-zA-Z0-9]+/g, "_") || "unknown";
	return `s_${safe}_${hash32(value).toString(36)}`;
}

export function assignSeriesColours(
	values: string[],
	palette: string[] = DEFAULT_PASTELS
) {
	const entries = values
		.map((value) => ({ value, h: hash32(value) }))
		.sort((a, b) => a.h - b.h);

	const out: Record<string, { fill: string; stroke: string }> = {};
	const step = Math.max(1, Math.round(palette.length * 0.381966));

	entries.forEach((entry, i) => {
		const idx = (entry.h + i * step) % palette.length;
		const fill = palette[idx];
		const hue = (entry.h + i * GOLDEN_ANGLE) % 360;
		const stroke = `hsl(${hue} 40% 55% / 0.9)`;
		out[entry.value] = { fill, stroke };
	});

	return out;
}

export { DEFAULT_PASTELS };
