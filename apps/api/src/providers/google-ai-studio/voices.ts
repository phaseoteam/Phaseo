// Purpose: Google TTS voice registry.
// Why: Provides canonical voice names and alias normalization for Gemini TTS.
// How: Maps normalized aliases to Google prebuilt voice names.

import { createVoiceAliasMap, resolveVoiceAlias } from "@providers/shared/voices";

const GOOGLE_TTS_VOICE_NAMES = [
	"Zephyr",
	"Puck",
	"Charon",
	"Kore",
	"Fenrir",
	"Leda",
	"Orus",
	"Aoede",
	"Callirrhoe",
	"Autonoe",
	"Enceladus",
	"Iapetus",
	"Umbriel",
	"Algieba",
	"Despina",
	"Erinome",
	"Algenib",
	"Rasalgethi",
	"Laomedeia",
	"Achernar",
	"Alnilam",
	"Schedar",
	"Gacrux",
	"Pulcherrima",
	"Achird",
	"Zubenelgenubi",
	"Vindemiatrix",
	"Sadachbia",
	"Sadaltager",
	"Sulafat",
] as const;

export const GOOGLE_TTS_VOICE_ALIAS_MAP = createVoiceAliasMap(
	GOOGLE_TTS_VOICE_NAMES.map((voice) => ({ value: voice })),
);

export const GOOGLE_TTS_VOICES = [...GOOGLE_TTS_VOICE_NAMES];

export function resolveGoogleTtsVoiceName(voice: string): string {
	return resolveVoiceAlias(voice, GOOGLE_TTS_VOICE_ALIAS_MAP);
}

export function validateGoogleTtsVoiceForModel(
	_model: string,
	voice: string,
): { ok: true; resolved: string; supported: string[] } | { ok: false; resolved: string; supported: string[] } {
	const resolved = resolveGoogleTtsVoiceName(voice);
	const supported = [...GOOGLE_TTS_VOICES] as string[];
	if (supported.includes(resolved)) {
		return { ok: true, resolved, supported };
	}
	return { ok: false, resolved, supported };
}
