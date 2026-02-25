// Purpose: OpenAI TTS voice registry.
// Why: Provides a canonical source for supported OpenAI voice aliases.
// How: Maps normalized aliases to OpenAI-native voice names.

import { createVoiceAliasMap, resolveVoiceAlias } from "@providers/shared/voices";

const OPENAI_VOICE_DEFINITIONS: Array<{ value: string; aliases?: string[] }> = [
	{ value: "alloy", aliases: ["default"] },
	{ value: "ash" },
	{ value: "ballad" },
	{ value: "coral" },
	{ value: "echo" },
	{ value: "fable" },
	{ value: "onyx" },
	{ value: "nova" },
	{ value: "sage" },
	{ value: "shimmer" },
	{ value: "verse" },
	{ value: "cedar" },
	{ value: "marin", aliases: ["marine"] },
];

export const OPENAI_TTS_VOICE_ALIAS_MAP = createVoiceAliasMap(
	OPENAI_VOICE_DEFINITIONS,
);

export const OPENAI_TTS_VOICES = OPENAI_VOICE_DEFINITIONS.map((entry) => entry.value);

export function resolveOpenAIVoiceName(voice: string): string {
	return resolveVoiceAlias(voice, OPENAI_TTS_VOICE_ALIAS_MAP);
}

export function validateOpenAIVoiceForModel(
	_model: string,
	voice: string,
): { ok: true; resolved: string; supported: string[] } | { ok: false; resolved: string; supported: string[] } {
	const resolved = resolveOpenAIVoiceName(voice);
	const supported = [...OPENAI_TTS_VOICES];
	if (supported.includes(resolved)) {
		return { ok: true, resolved, supported };
	}
	return { ok: false, resolved, supported };
}
