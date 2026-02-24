// Purpose: ElevenLabs TTS voice registry.
// Why: Maps common public ElevenLabs voice aliases to voice IDs while allowing passthrough IDs.
// How: Resolves aliases case-insensitively and returns canonical voice IDs.

import { createVoiceAliasMap, resolveVoiceAlias } from "@providers/shared/voices";

const ELEVENLABS_VOICE_DEFINITIONS = [
	{ value: "21m00Tcm4TlvDq8ikWAM", aliases: ["rachel"] },
	{ value: "AZnzlk1XvdvUeBnXmlld", aliases: ["domi"] },
	{ value: "EXAVITQu4vr4xnSDxMaL", aliases: ["bella"] },
	{ value: "ErXwobaYiN019PkySvjV", aliases: ["antoni"] },
	{ value: "MF3mGyEYCl7XYWbV9V6O", aliases: ["elli"] },
	{ value: "TxGEqnHWrfWFTfGW9XjX", aliases: ["josh"] },
	{ value: "VR6AewLTigWG4xSOukaG", aliases: ["arnold"] },
	{ value: "pNInz6obpgDQGcFmaJgB", aliases: ["adam"] },
	{ value: "yoZ06aMxZJJ28mfd3POQ", aliases: ["sam"] },
] as const;

export const ELEVENLABS_TTS_VOICE_ALIAS_MAP = createVoiceAliasMap(
	ELEVENLABS_VOICE_DEFINITIONS.map((entry) => ({
		value: entry.value,
		aliases: entry.aliases ? [...entry.aliases] : [],
	})),
);

export const ELEVENLABS_TTS_VOICES = ELEVENLABS_VOICE_DEFINITIONS.map((entry) => ({
	voice_id: entry.value,
	aliases: entry.aliases ? [...entry.aliases] : [],
}));
export const ELEVENLABS_TTS_VOICE_IDS = ELEVENLABS_TTS_VOICES.map((voice) => voice.voice_id);
export const ELEVENLABS_TTS_VOICE_ALIASES = ELEVENLABS_TTS_VOICES.flatMap((voice) => voice.aliases);

export function resolveElevenLabsVoiceId(voice: string): string {
	return resolveVoiceAlias(voice, ELEVENLABS_TTS_VOICE_ALIAS_MAP);
}

export function validateElevenLabsVoiceForModel(
	_model: string,
	voice: string,
): { ok: true; resolved: string; supported: string[] } | { ok: false; resolved: string; supported: string[] } {
	const resolved = resolveElevenLabsVoiceId(voice);
	const supported = [...ELEVENLABS_TTS_VOICE_IDS] as string[];
	if (supported.includes(resolved)) {
		return { ok: true, resolved, supported };
	}
	return { ok: false, resolved, supported };
}
