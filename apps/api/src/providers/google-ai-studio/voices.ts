// Purpose: Google TTS voice registry.
// Why: Provides canonical voice names and alias normalization for Gemini TTS, and lets
//      Gemini 3.8 TTS use the custom voices Google stores for a project.
// How: Maps normalized aliases to Google prebuilt voice names; accepts stored voice ids
//      (voice_...) and replication keys (voicekey_...) on models that support them.

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

// Google's speech guide: voice design, replication and remix work on the two 3.8 TTS models only.
export function googleTtsSupportsCustomVoices(model: string): boolean {
	const slug = model.toLowerCase().split("/").pop() ?? "";
	return /^gemini-3\.8-flash(?:-lite)?-tts\b/.test(slug);
}

// Stored voices are "voice_..."; stateless replication keys are "voicekey_...".
export function isGoogleCustomVoiceId(voice: string): boolean {
	return /^voice(?:key)?_[A-Za-z0-9_-]+$/.test(voice.trim());
}

export function validateGoogleTtsVoiceForModel(
	model: string,
	voice: string,
): {
	ok: boolean;
	resolved: string;
	supported: string[];
	/** True when the voice is a custom voice id, sent as voiceConfig.voice. */
	custom?: boolean;
	message?: string;
} {
	const supported = [...GOOGLE_TTS_VOICES] as string[];
	if (isGoogleCustomVoiceId(voice)) {
		const resolved = voice.trim();
		if (googleTtsSupportsCustomVoices(model)) {
			return { ok: true, resolved, supported, custom: true };
		}
		return {
			ok: false,
			resolved,
			supported,
			message: `Custom voices (voice_... and voicekey_... ids) need a Gemini 3.8 TTS model; "${model}" only takes the prebuilt voices.`,
		};
	}
	const resolved = resolveGoogleTtsVoiceName(voice);
	if (supported.includes(resolved)) {
		return { ok: true, resolved, supported };
	}
	return { ok: false, resolved, supported };
}
