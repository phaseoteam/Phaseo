import type { CountrySummary } from "@/lib/fetchers/countries/types";
import type { ModelCard } from "@/lib/fetchers/models/getAllModels";

const FLAG_PLACEHOLDER = "\u{1F3F3}\uFE0F";

export function flagEmojiFromIso(iso: string) {
	if (!iso || iso.length !== 2) return FLAG_PLACEHOLDER;
	const codePoints = iso
		.toUpperCase()
		.split("")
		.map((char) => 127397 + char.charCodeAt(0));
	return String.fromCodePoint(...codePoints);
}

export function formatCountryDate(value: string | null | undefined) {
	if (!value) return "Unknown";
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return "Unknown";
	return parsed.toLocaleString("en-US", {
		month: "short",
		year: "numeric",
	});
}

export function normaliseIso(isoInput: string | undefined) {
	if (typeof isoInput !== "string") return "";
	const trimmed = isoInput.trim();
	return trimmed ? trimmed.toUpperCase() : "";
}

export function getUniqueCountryModels(
	country: CountrySummary | undefined | null,
): ModelCard[] {
	if (!country) return [];

	const seen = new Set<string>();
	return country.organisations
		.flatMap((organisation) => organisation.models)
		.filter((model) => {
			if (seen.has(model.model_id)) return false;
			seen.add(model.model_id);
			return true;
		})
		.sort(
			(a, b) => (b.primary_timestamp ?? 0) - (a.primary_timestamp ?? 0),
		);
}
