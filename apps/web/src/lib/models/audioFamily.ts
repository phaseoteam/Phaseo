/** Output groups that sit under the Audio chip on the models page. */
export const AUDIO_FAMILY_GROUPS = [
	"audio_tts",
	"audio_stt",
	"translation",
	"realtime",
	"audio_music",
] as const;

const AUDIO_FAMILY = new Set<string>(AUDIO_FAMILY_GROUPS);

export function isAudioFamilyGroup(value: string): boolean {
	return AUDIO_FAMILY.has(value);
}

/** The Audio row is open while Audio or any of its sub-types is selected. */
export function isAudioFamilyOpen(selected: readonly string[]): boolean {
	return selected.some((value) => value === "audio" || AUDIO_FAMILY.has(value));
}

/**
 * Audio opens or closes the family, a sub-type narrows to just that one (and
 * going back to it returns to all audio), and every other chip toggles.
 */
export function toggleOutputModality(
	selected: readonly string[],
	value: string,
): string[] {
	const withoutAudio = selected.filter(
		(item) => item !== "audio" && !AUDIO_FAMILY.has(item),
	);
	if (value === "audio") {
		return isAudioFamilyOpen(selected) ? withoutAudio : [...withoutAudio, "audio"];
	}
	if (AUDIO_FAMILY.has(value)) {
		return selected.includes(value)
			? [...withoutAudio, "audio"]
			: [...withoutAudio, value];
	}
	return selected.includes(value)
		? selected.filter((item) => item !== value)
		: [...selected, value];
}
