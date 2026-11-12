// Venice price cards copied from the catalogue, keyed by "<model>|<capability>".

// Copied from pricing/venice/openai-gpt-6-astra/text.generate/pricing.json (source/note metadata dropped).
export const venice_openaiGpt6AstraTextGenerate = {
	key: "venice:openai/gpt-6-astra:text.generate",
	api_provider_id: "venice",
	provider_slug: "venice",
	api_model_id: "openai/gpt-6-astra",
	capability_id: "text.generate",
	rules: [
		{"meter":"input_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":10,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"lte","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"lte","value":272000}]},
		{"meter":"input_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":20,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"gt","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"gt","value":272000}]},
		{"meter":"cached_read_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":1,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"lte","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"lte","value":272000}]},
		{"meter":"cached_read_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":2,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"gt","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"gt","value":272000}]},
		{"meter":"cached_write_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":12.5,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"lte","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"lte","value":272000}]},
		{"meter":"cached_write_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":25,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"gt","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"gt","value":272000}]},
		{"meter":"output_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":50,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"lte","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"lte","value":272000}]},
		{"meter":"output_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":75,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"gt","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"gt","value":272000}]},
		{"meter":"native_web_search_requests","unit":"request","unit_size":1,"price_per_unit":0.01,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[]},
	],
};

// Copied from pricing/venice/openai-gpt-6-astra-pro/text.generate/pricing.json (source/note metadata dropped).
export const venice_openaiGpt6AstraProTextGenerate = {
	key: "venice:openai/gpt-6-astra-pro:text.generate",
	api_provider_id: "venice",
	provider_slug: "venice",
	api_model_id: "openai/gpt-6-astra-pro",
	capability_id: "text.generate",
	rules: [
		{"meter":"input_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":12.5,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"lte","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"lte","value":272000}]},
		{"meter":"input_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":25,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"gt","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"gt","value":272000}]},
		{"meter":"cached_read_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":1.25,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"lte","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"lte","value":272000}]},
		{"meter":"cached_read_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":2.5,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"gt","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"gt","value":272000}]},
		{"meter":"cached_write_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":15.625,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"lte","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"lte","value":272000}]},
		{"meter":"cached_write_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":31.25,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"gt","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"gt","value":272000}]},
		{"meter":"output_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":62.5,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"lte","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"lte","value":272000}]},
		{"meter":"output_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":93.75,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_tokens","op":"gt","value":272000}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"input_tokens","op":"gt","value":272000}]},
		{"meter":"native_web_search_requests","unit":"request","unit_size":1,"price_per_unit":0.01,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[]},
	],
};

// Copied from pricing/venice/google-gemini-3.6-flash/text.generate/pricing.json (source/note metadata dropped).
export const venice_googleGemini36FlashTextGenerate = {
	key: "venice:google/gemini-3.6-flash:text.generate",
	api_provider_id: "venice",
	provider_slug: "venice",
	api_model_id: "google/gemini-3.6-flash",
	capability_id: "text.generate",
	rules: [
		{"meter":"input_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":0.9375,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[]},
		{"meter":"cached_read_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":0.09375,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[]},
		{"meter":"output_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":4.6875,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[]},
		{"meter":"native_web_search_requests","unit":"request","unit_size":1,"price_per_unit":0.01,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[]},
	],
};

// Copied from pricing/venice/moonshotai-kimi-k3/text.generate/pricing.json (source/note metadata dropped).
export const venice_moonshotaiKimiK3TextGenerate = {
	key: "venice:moonshotai/kimi-k3:text.generate",
	api_provider_id: "venice",
	provider_slug: "venice",
	api_model_id: "moonshotai/kimi-k3",
	capability_id: "text.generate",
	rules: [
		{"meter":"input_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":3.75,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[]},
		{"meter":"cached_read_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":0.375,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[]},
		{"meter":"output_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":18.75,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[]},
		{"meter":"input_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":4.5,"currency":"USD","pricing_plan":"fast","match":[],"priority":110,"region":null,"cache_duration_seconds":null,"conditions":[]},
		{"meter":"cached_read_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":0.45,"currency":"USD","pricing_plan":"fast","match":[],"priority":110,"region":null,"cache_duration_seconds":null,"conditions":[]},
		{"meter":"output_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":22.5,"currency":"USD","pricing_plan":"fast","match":[],"priority":110,"region":null,"cache_duration_seconds":null,"conditions":[]},
		{"meter":"native_web_search_requests","unit":"request","unit_size":1,"price_per_unit":0.01,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[]},
	],
};

// Copied from pricing/venice/openai-gpt-image-2/image.edit/pricing.json (source/note metadata dropped).
export const venice_openaiGptImage2ImageEdit = {
	key: "venice:openai/gpt-image-2:image.edit",
	api_provider_id: "venice",
	provider_slug: "venice",
	api_model_id: "openai/gpt-image-2",
	capability_id: "image.edit",
	rules: [
		{"meter":"output_image","unit":"image","unit_size":1,"price_per_unit":0.34,"currency":"USD","pricing_plan":"standard","match":[{"path":"image_params.resolution","op":"eq","value":"1K"}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"image_params.resolution","op":"eq","value":"1K"}]},
		{"meter":"output_image","unit":"image","unit_size":1,"price_per_unit":0.52,"currency":"USD","pricing_plan":"standard","match":[{"path":"image_params.resolution","op":"eq","value":"2K"}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"image_params.resolution","op":"eq","value":"2K"}]},
		{"meter":"output_image","unit":"image","unit_size":1,"price_per_unit":0.84,"currency":"USD","pricing_plan":"standard","match":[{"path":"image_params.resolution","op":"eq","value":"4K"}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"image_params.resolution","op":"eq","value":"4K"}]},
		{"meter":"output_image","unit":"image","unit_size":1,"price_per_unit":0.34,"currency":"USD","pricing_plan":"standard","match":[{"path":"image_params.resolution","op":"eq","value":"1K"},{"path":"image_params.quality","op":"eq","value":"high"}],"priority":110,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"image_params.resolution","op":"eq","value":"1K"},{"path":"image_params.quality","op":"eq","value":"high"}]},
		{"meter":"output_image","unit":"image","unit_size":1,"price_per_unit":0.03,"currency":"USD","pricing_plan":"standard","match":[{"path":"image_params.resolution","op":"eq","value":"1K"},{"path":"image_params.quality","op":"eq","value":"low"}],"priority":110,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"image_params.resolution","op":"eq","value":"1K"},{"path":"image_params.quality","op":"eq","value":"low"}]},
		{"meter":"output_image","unit":"image","unit_size":1,"price_per_unit":0.08,"currency":"USD","pricing_plan":"standard","match":[{"path":"image_params.resolution","op":"eq","value":"1K"},{"path":"image_params.quality","op":"eq","value":"medium"}],"priority":110,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"image_params.resolution","op":"eq","value":"1K"},{"path":"image_params.quality","op":"eq","value":"medium"}]},
		{"meter":"output_image","unit":"image","unit_size":1,"price_per_unit":0.52,"currency":"USD","pricing_plan":"standard","match":[{"path":"image_params.resolution","op":"eq","value":"2K"},{"path":"image_params.quality","op":"eq","value":"high"}],"priority":110,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"image_params.resolution","op":"eq","value":"2K"},{"path":"image_params.quality","op":"eq","value":"high"}]},
		{"meter":"output_image","unit":"image","unit_size":1,"price_per_unit":0.03,"currency":"USD","pricing_plan":"standard","match":[{"path":"image_params.resolution","op":"eq","value":"2K"},{"path":"image_params.quality","op":"eq","value":"low"}],"priority":110,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"image_params.resolution","op":"eq","value":"2K"},{"path":"image_params.quality","op":"eq","value":"low"}]},
		{"meter":"output_image","unit":"image","unit_size":1,"price_per_unit":0.14,"currency":"USD","pricing_plan":"standard","match":[{"path":"image_params.resolution","op":"eq","value":"2K"},{"path":"image_params.quality","op":"eq","value":"medium"}],"priority":110,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"image_params.resolution","op":"eq","value":"2K"},{"path":"image_params.quality","op":"eq","value":"medium"}]},
		{"meter":"output_image","unit":"image","unit_size":1,"price_per_unit":0.84,"currency":"USD","pricing_plan":"standard","match":[{"path":"image_params.resolution","op":"eq","value":"4K"},{"path":"image_params.quality","op":"eq","value":"high"}],"priority":110,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"image_params.resolution","op":"eq","value":"4K"},{"path":"image_params.quality","op":"eq","value":"high"}]},
		{"meter":"output_image","unit":"image","unit_size":1,"price_per_unit":0.04,"currency":"USD","pricing_plan":"standard","match":[{"path":"image_params.resolution","op":"eq","value":"4K"},{"path":"image_params.quality","op":"eq","value":"low"}],"priority":110,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"image_params.resolution","op":"eq","value":"4K"},{"path":"image_params.quality","op":"eq","value":"low"}]},
		{"meter":"output_image","unit":"image","unit_size":1,"price_per_unit":0.22,"currency":"USD","pricing_plan":"standard","match":[{"path":"image_params.resolution","op":"eq","value":"4K"},{"path":"image_params.quality","op":"eq","value":"medium"}],"priority":110,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"image_params.resolution","op":"eq","value":"4K"},{"path":"image_params.quality","op":"eq","value":"medium"}]},
		{"meter":"input_image","unit":"image","unit_size":1,"price_per_unit":0.0092,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[],"included_quantity":1},
	],
};

// Copied from pricing/venice/hexgrad-kokoro-82m/audio.speech/pricing.json (source/note metadata dropped).
export const venice_hexgradKokoro82mAudioSpeech = {
	key: "venice:hexgrad/kokoro-82m:audio.speech",
	api_provider_id: "venice",
	provider_slug: "venice",
	api_model_id: "hexgrad/kokoro-82m",
	capability_id: "audio.speech",
	rules: [
		{"meter":"input_characters","unit":"character","unit_size":1000000,"price_per_unit":3.5,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[]},
	],
};

// Copied from pricing/venice/openai-whisper-large-v3/audio.transcription/pricing.json (source/note metadata dropped).
export const venice_openaiWhisperLargeV3AudioTranscription = {
	key: "venice:openai/whisper-large-v3:audio.transcription",
	api_provider_id: "venice",
	provider_slug: "venice",
	api_model_id: "openai/whisper-large-v3",
	capability_id: "audio.transcription",
	rules: [
		{"meter":"input_audio_seconds","unit":"second","unit_size":1,"price_per_unit":0.0001,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[]},
	],
};

// Copied from pricing/venice/eleven-labs-music/music.generate/pricing.json (source/note metadata dropped).
export const venice_elevenLabsMusicMusicGenerate = {
	key: "venice:eleven-labs/music:music.generate",
	api_provider_id: "venice",
	provider_slug: "venice",
	api_model_id: "eleven-labs/music",
	capability_id: "music.generate",
	rules: [
		{"meter":"requests","unit":"request","unit_size":1,"price_per_unit":0.69,"currency":"USD","pricing_plan":"standard","match":[{"path":"duration_seconds","op":"gte","value":3},{"path":"duration_seconds","op":"lte","value":60}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"duration_seconds","op":"gte","value":3},{"path":"duration_seconds","op":"lte","value":60}]},
		{"meter":"requests","unit":"request","unit_size":1,"price_per_unit":1.38,"currency":"USD","pricing_plan":"standard","match":[{"path":"duration_seconds","op":"gte","value":61},{"path":"duration_seconds","op":"lte","value":120}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"duration_seconds","op":"gte","value":61},{"path":"duration_seconds","op":"lte","value":120}]},
		{"meter":"requests","unit":"request","unit_size":1,"price_per_unit":2.08,"currency":"USD","pricing_plan":"standard","match":[{"path":"duration_seconds","op":"gte","value":121},{"path":"duration_seconds","op":"lte","value":180}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"duration_seconds","op":"gte","value":121},{"path":"duration_seconds","op":"lte","value":180}]},
		{"meter":"requests","unit":"request","unit_size":1,"price_per_unit":2.76,"currency":"USD","pricing_plan":"standard","match":[{"path":"duration_seconds","op":"gte","value":181},{"path":"duration_seconds","op":"lte","value":240}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"duration_seconds","op":"gte","value":181},{"path":"duration_seconds","op":"lte","value":240}]},
		{"meter":"requests","unit":"request","unit_size":1,"price_per_unit":3.45,"currency":"USD","pricing_plan":"standard","match":[{"path":"duration_seconds","op":"gte","value":241},{"path":"duration_seconds","op":"lte","value":300}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"duration_seconds","op":"gte","value":241},{"path":"duration_seconds","op":"lte","value":300}]},
		{"meter":"requests","unit":"request","unit_size":1,"price_per_unit":4.15,"currency":"USD","pricing_plan":"standard","match":[{"path":"duration_seconds","op":"gte","value":301},{"path":"duration_seconds","op":"lte","value":360}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"duration_seconds","op":"gte","value":301},{"path":"duration_seconds","op":"lte","value":360}]},
		{"meter":"requests","unit":"request","unit_size":1,"price_per_unit":4.84,"currency":"USD","pricing_plan":"standard","match":[{"path":"duration_seconds","op":"gte","value":361},{"path":"duration_seconds","op":"lte","value":420}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"duration_seconds","op":"gte","value":361},{"path":"duration_seconds","op":"lte","value":420}]},
		{"meter":"requests","unit":"request","unit_size":1,"price_per_unit":5.52,"currency":"USD","pricing_plan":"standard","match":[{"path":"duration_seconds","op":"gte","value":421},{"path":"duration_seconds","op":"lte","value":480}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"duration_seconds","op":"gte","value":421},{"path":"duration_seconds","op":"lte","value":480}]},
		{"meter":"requests","unit":"request","unit_size":1,"price_per_unit":6.22,"currency":"USD","pricing_plan":"standard","match":[{"path":"duration_seconds","op":"gte","value":481},{"path":"duration_seconds","op":"lte","value":540}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"duration_seconds","op":"gte","value":481},{"path":"duration_seconds","op":"lte","value":540}]},
		{"meter":"requests","unit":"request","unit_size":1,"price_per_unit":6.9,"currency":"USD","pricing_plan":"standard","match":[{"path":"duration_seconds","op":"gte","value":541},{"path":"duration_seconds","op":"lte","value":600}],"priority":100,"region":null,"cache_duration_seconds":null,"conditions":[{"path":"duration_seconds","op":"gte","value":541},{"path":"duration_seconds","op":"lte","value":600}]},
	],
};

export const VENICE_CARDS: Record<string, { rules: ReadonlyArray<Record<string, unknown>> }> = {
	"openai/gpt-6-astra|text.generate": venice_openaiGpt6AstraTextGenerate,
	"openai/gpt-6-astra-pro|text.generate": venice_openaiGpt6AstraProTextGenerate,
	"google/gemini-3.6-flash|text.generate": venice_googleGemini36FlashTextGenerate,
	"moonshotai/kimi-k3|text.generate": venice_moonshotaiKimiK3TextGenerate,
	"openai/gpt-image-2|image.edit": venice_openaiGptImage2ImageEdit,
	"hexgrad/kokoro-82m|audio.speech": venice_hexgradKokoro82mAudioSpeech,
	"openai/whisper-large-v3|audio.transcription": venice_openaiWhisperLargeV3AudioTranscription,
	"eleven-labs/music|music.generate": venice_elevenLabsMusicMusicGenerate,
};
