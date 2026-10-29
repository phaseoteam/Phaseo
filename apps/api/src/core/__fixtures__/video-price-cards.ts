// video.generate price cards copied from the catalogue, keyed by "<provider>/<model directory>".

// Copied from pricing/ltx/ltx-2-3-fast/video.generate/pricing.json (source/note metadata dropped).
export const ltxLtx23FastCard = {
	key: "ltx:ltx-2-3-fast:video.generate",
	api_provider_id: "ltx",
	provider_slug: "ltx",
	api_model_id: "ltx-2-3-fast",
	capability_id: "video.generate",
	rules: [
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.03,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["1280x720","720x1280"]}],"conditions":[],"priority":100,"effective_from":"2026-08-01T00:00:00Z"},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.06,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["1920x1080","1080x1920"]}],"conditions":[],"priority":100,"effective_from":"2026-08-01T00:00:00Z"},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.12,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["2560x1440","1440x2560"]}],"conditions":[],"priority":100,"effective_from":"2026-08-01T00:00:00Z"},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.24,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["3840x2160","2160x3840"]}],"conditions":[],"priority":100,"effective_from":"2026-08-01T00:00:00Z"},
	],
};

// Copied from pricing/ltx/ltx-2-3-pro/video.generate/pricing.json (source/note metadata dropped).
export const ltxLtx23ProCard = {
	key: "ltx:ltx-2-3-pro:video.generate",
	api_provider_id: "ltx",
	provider_slug: "ltx",
	api_model_id: "ltx-2-3-pro",
	capability_id: "video.generate",
	rules: [
		{"meter":"input_audio_seconds","unit":"second","unit_size":1,"price_per_unit":0.06,"currency":"USD","pricing_plan":"standard","match":[{"path":"mode","op":"eq","value":"audio-to-video"},{"path":"resolution","op":"in","value":["1280x720","720x1280"]}],"conditions":[],"priority":110,"effective_from":"2026-09-06T00:00:00Z"},
		{"meter":"input_audio_seconds","unit":"second","unit_size":1,"price_per_unit":0.18,"currency":"USD","pricing_plan":"standard","match":[{"path":"mode","op":"eq","value":"audio-to-video"},{"path":"resolution","op":"in","value":["2560x1440","1440x2560"]}],"conditions":[],"priority":110,"effective_from":"2026-09-06T00:00:00Z"},
		{"meter":"input_audio_seconds","unit":"second","unit_size":1,"price_per_unit":0.34,"currency":"USD","pricing_plan":"standard","match":[{"path":"mode","op":"eq","value":"audio-to-video"},{"path":"resolution","op":"in","value":["3840x2160","2160x3840"]}],"conditions":[],"priority":110,"effective_from":"2026-09-06T00:00:00Z"},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.04,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["1280x720","720x1280"]}],"conditions":[],"priority":100,"effective_from":"2026-08-01T00:00:00Z"},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.08,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["1920x1080","1080x1920"]}],"conditions":[],"priority":100,"effective_from":"2026-08-01T00:00:00Z"},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.16,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["2560x1440","1440x2560"]}],"conditions":[],"priority":100,"effective_from":"2026-08-01T00:00:00Z"},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.32,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["3840x2160","2160x3840"]}],"conditions":[],"priority":100,"effective_from":"2026-08-01T00:00:00Z"},
		{"meter":"input_audio_seconds","unit":"second","unit_size":1,"price_per_unit":0.1,"currency":"USD","pricing_plan":"standard","match":[{"path":"mode","op":"eq","value":"audio-to-video"},{"path":"resolution","op":"in","value":["1920x1080","1080x1920"]}],"conditions":[],"priority":110,"effective_from":"2026-08-01T00:00:00Z"},
	],
};

// Copied from pricing/ltx/ltx-2-5-fast/video.generate/pricing.json (source/note metadata dropped).
export const ltxLtx25FastCard = {
	key: "ltx:ltx-2-5-fast:video.generate",
	api_provider_id: "ltx",
	provider_slug: "ltx",
	api_model_id: "ltx-2-5-fast",
	capability_id: "video.generate",
	rules: [
		{"meter":"input_audio_seconds","unit":"second","unit_size":1,"price_per_unit":0.09,"currency":"USD","pricing_plan":"standard","match":[{"path":"mode","op":"eq","value":"audio-to-video"},{"path":"resolution","op":"in","value":["1280x720","720x1280"]}],"conditions":[],"priority":110,"effective_from":"2026-09-06T00:00:00Z"},
		{"meter":"input_audio_seconds","unit":"second","unit_size":1,"price_per_unit":0.19,"currency":"USD","pricing_plan":"standard","match":[{"path":"mode","op":"eq","value":"audio-to-video"},{"path":"resolution","op":"in","value":["2560x1440","1440x2560"]}],"conditions":[],"priority":110,"effective_from":"2026-09-06T00:00:00Z"},
		{"meter":"input_audio_seconds","unit":"second","unit_size":1,"price_per_unit":0.3,"currency":"USD","pricing_plan":"standard","match":[{"path":"mode","op":"eq","value":"audio-to-video"},{"path":"resolution","op":"in","value":["3840x2160","2160x3840"]}],"conditions":[],"priority":110,"effective_from":"2026-09-06T00:00:00Z"},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.09,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["1280x720","720x1280"]}],"conditions":[],"priority":100,"effective_from":"2026-08-01T00:00:00Z"},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.13,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["1920x1080","1080x1920"]}],"conditions":[],"priority":100,"effective_from":"2026-08-01T00:00:00Z"},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.19,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["2560x1440","1440x2560"]}],"conditions":[],"priority":100,"effective_from":"2026-08-01T00:00:00Z"},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.3,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["3840x2160","2160x3840"]}],"conditions":[],"priority":100,"effective_from":"2026-08-01T00:00:00Z"},
		{"meter":"input_audio_seconds","unit":"second","unit_size":1,"price_per_unit":0.13,"currency":"USD","pricing_plan":"standard","match":[{"path":"mode","op":"eq","value":"audio-to-video"},{"path":"resolution","op":"in","value":["1920x1080","1080x1920"]}],"conditions":[],"priority":110,"effective_from":"2026-08-01T00:00:00Z"},
	],
};

// Copied from pricing/ltx/ltx-2-5-pro/video.generate/pricing.json (source/note metadata dropped).
export const ltxLtx25ProCard = {
	key: "ltx:ltx-2-5-pro:video.generate",
	api_provider_id: "ltx",
	provider_slug: "ltx",
	api_model_id: "ltx-2-5-pro",
	capability_id: "video.generate",
	rules: [
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.25,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["2560x1440","1440x2560"]}],"conditions":[],"priority":100,"effective_from":"2026-09-06T00:00:00Z"},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.39,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["3840x2160","2160x3840"]}],"conditions":[],"priority":100,"effective_from":"2026-09-06T00:00:00Z"},
		{"meter":"input_audio_seconds","unit":"second","unit_size":1,"price_per_unit":0.25,"currency":"USD","pricing_plan":"standard","match":[{"path":"mode","op":"eq","value":"audio-to-video"},{"path":"resolution","op":"in","value":["2560x1440","1440x2560"]}],"conditions":[],"priority":110,"effective_from":"2026-09-06T00:00:00Z"},
		{"meter":"input_audio_seconds","unit":"second","unit_size":1,"price_per_unit":0.39,"currency":"USD","pricing_plan":"standard","match":[{"path":"mode","op":"eq","value":"audio-to-video"},{"path":"resolution","op":"in","value":["3840x2160","2160x3840"]}],"conditions":[],"priority":110,"effective_from":"2026-09-06T00:00:00Z"},
		{"meter":"input_audio_seconds","unit":"second","unit_size":1,"price_per_unit":0.12,"currency":"USD","pricing_plan":"standard","match":[{"path":"mode","op":"eq","value":"audio-to-video"},{"path":"resolution","op":"in","value":["1280x720","720x1280"]}],"conditions":[],"priority":110,"effective_from":"2026-09-06T00:00:00Z"},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.12,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["1280x720","720x1280"]}],"conditions":[],"priority":100,"effective_from":"2026-08-01T00:00:00Z"},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.17,"currency":"USD","pricing_plan":"standard","match":[{"path":"resolution","op":"in","value":["1920x1080","1080x1920"]}],"conditions":[],"priority":100,"effective_from":"2026-08-01T00:00:00Z"},
		{"meter":"input_audio_seconds","unit":"second","unit_size":1,"price_per_unit":0.17,"currency":"USD","pricing_plan":"standard","match":[{"path":"mode","op":"eq","value":"audio-to-video"},{"path":"resolution","op":"in","value":["1920x1080","1080x1920"]}],"conditions":[],"priority":110,"effective_from":"2026-08-01T00:00:00Z"},
	],
};

// Copied from pricing/black-forest-labs/black-forest-labs-flux-3-video/video.generate/pricing.json (source/note metadata dropped).
export const bflFlux3VideoCard = {
	key: "black-forest-labs:black-forest-labs/flux-3-video:video.generate",
	api_provider_id: "black-forest-labs",
	provider_slug: "black-forest-labs",
	api_model_id: "black-forest-labs/flux-3-video",
	capability_id: "video.generate",
	rules: [
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.17,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.mode","op":"ne","or_group":1,"and_index":1,"value":"v2v"},{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":2,"value":"hd"},{"path":"video_params.draft","op":"eq","or_group":1,"and_index":3,"value":false}],"priority":100,"effective_from":"2026-08-04T00:00:00Z","region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.mode","op":"ne","or_group":1,"and_index":1,"value":"v2v"},{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":2,"value":"hd"},{"path":"video_params.draft","op":"eq","or_group":1,"and_index":3,"value":false}]},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.29,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.mode","op":"ne","or_group":1,"and_index":1,"value":"v2v"},{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":2,"value":"fhd"},{"path":"video_params.draft","op":"eq","or_group":1,"and_index":3,"value":false}],"priority":100,"effective_from":"2026-08-04T00:00:00Z","region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.mode","op":"ne","or_group":1,"and_index":1,"value":"v2v"},{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":2,"value":"fhd"},{"path":"video_params.draft","op":"eq","or_group":1,"and_index":3,"value":false}]},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.06,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.mode","op":"ne","or_group":1,"and_index":1,"value":"v2v"},{"path":"video_params.draft","op":"eq","or_group":1,"and_index":2,"value":true}],"priority":110,"effective_from":"2026-08-04T00:00:00Z","region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.mode","op":"ne","or_group":1,"and_index":1,"value":"v2v"},{"path":"video_params.draft","op":"eq","or_group":1,"and_index":2,"value":true}]},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.43,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.mode","op":"eq","or_group":1,"and_index":1,"value":"v2v"},{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":2,"value":"hd"},{"path":"video_params.draft","op":"eq","or_group":1,"and_index":3,"value":false}],"priority":100,"effective_from":"2026-08-04T00:00:00Z","region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.mode","op":"eq","or_group":1,"and_index":1,"value":"v2v"},{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":2,"value":"hd"},{"path":"video_params.draft","op":"eq","or_group":1,"and_index":3,"value":false}]},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.54,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.mode","op":"eq","or_group":1,"and_index":1,"value":"v2v"},{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":2,"value":"fhd"},{"path":"video_params.draft","op":"eq","or_group":1,"and_index":3,"value":false}],"priority":100,"effective_from":"2026-08-04T00:00:00Z","region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.mode","op":"eq","or_group":1,"and_index":1,"value":"v2v"},{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":2,"value":"fhd"},{"path":"video_params.draft","op":"eq","or_group":1,"and_index":3,"value":false}]},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.12,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.mode","op":"eq","or_group":1,"and_index":1,"value":"v2v"},{"path":"video_params.draft","op":"eq","or_group":1,"and_index":2,"value":true}],"priority":110,"effective_from":"2026-08-04T00:00:00Z","region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.mode","op":"eq","or_group":1,"and_index":1,"value":"v2v"},{"path":"video_params.draft","op":"eq","or_group":1,"and_index":2,"value":true}]},
	],
};

// Copied from pricing/google-vertex/google-veo-3.1-fast/video.generate/pricing.json (source/note metadata dropped).
export const googleVertexGoogleVeo31FastCard = {
	key: "google-vertex:google/veo-3.1-fast:video.generate",
	api_provider_id: "google-vertex",
	provider_slug: "google-vertex",
	api_model_id: "google/veo-3.1-fast",
	capability_id: "video.generate",
	rules: [
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.1,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"720p"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":true}],"priority":100,"region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"720p"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":true}]},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.12,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"1080p"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":true}],"priority":100,"region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"1080p"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":true}]},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.3,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"4k"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":true}],"priority":100,"region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"4k"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":true}]},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.08,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"720p"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":false}],"priority":100,"region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"720p"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":false}]},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.1,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"1080p"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":false}],"priority":100,"region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"1080p"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":false}]},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.25,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"4k"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":false}],"priority":100,"region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"4k"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":false}]},
	],
};

// Copied from pricing/google-vertex/google-veo-3.1/video.generate/pricing.json (source/note metadata dropped).
export const googleVertexGoogleVeo31Card = {
	key: "google-vertex:google/veo-3.1:video.generate",
	api_provider_id: "google-vertex",
	provider_slug: "google-vertex",
	api_model_id: "google/veo-3.1",
	capability_id: "video.generate",
	rules: [
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.4,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.resolution","op":"in","or_group":1,"and_index":1,"value":["720p","1080p"]},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":true}],"priority":100,"region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.resolution","op":"in","or_group":1,"and_index":1,"value":["720p","1080p"]},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":true}]},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.6,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"4k"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":true}],"priority":100,"region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"4k"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":true}]},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.2,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.resolution","op":"in","or_group":1,"and_index":1,"value":["720p","1080p"]},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":false}],"priority":100,"region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.resolution","op":"in","or_group":1,"and_index":1,"value":["720p","1080p"]},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":false}]},
		{"meter":"output_video_seconds","unit":"second","unit_size":1,"price_per_unit":0.4,"currency":"USD","pricing_plan":"standard","match":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"4k"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":false}],"priority":100,"region":"global","cache_duration_seconds":null,"conditions":[{"path":"video_params.resolution","op":"eq","or_group":1,"and_index":1,"value":"4k"},{"path":"video_params.audio","op":"eq","or_group":1,"and_index":2,"value":false}]},
	],
};

// Copied from pricing/byteplus/bytedance-seedance-2.0/video.generate/pricing.json (source/note metadata dropped).
export const byteplusBytedanceSeedance20Card = {
	key: "byteplus:bytedance/seedance-2.0:video.generate",
	api_provider_id: "byteplus",
	provider_slug: "byteplus",
	api_model_id: "bytedance/seedance-2.0",
	capability_id: "video.generate",
	rules: [
		{"meter":"total_tokens","unit":"token","unit_size":1000000,"price_per_unit":7,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_video_seconds","op":"eq","value":0},{"path":"resolution","op":"in","value":["480p","720p"]}],"conditions":[{"path":"input_video_seconds","op":"eq","value":0},{"path":"resolution","op":"in","value":["480p","720p"]}],"priority":100,"effective_from":"2026-09-06T00:00:00Z"},
		{"meter":"total_tokens","unit":"token","unit_size":1000000,"price_per_unit":4.3,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_video_seconds","op":"gt","value":0},{"path":"resolution","op":"in","value":["480p","720p"]}],"conditions":[{"path":"input_video_seconds","op":"gt","value":0},{"path":"resolution","op":"in","value":["480p","720p"]}],"priority":100,"effective_from":"2026-09-06T00:00:00Z"},
		{"meter":"total_tokens","unit":"token","unit_size":1000000,"price_per_unit":7.7,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_video_seconds","op":"eq","value":0},{"path":"resolution","op":"in","value":["1080p"]}],"conditions":[{"path":"input_video_seconds","op":"eq","value":0},{"path":"resolution","op":"in","value":["1080p"]}],"priority":100,"effective_from":"2026-09-06T00:00:00Z"},
		{"meter":"total_tokens","unit":"token","unit_size":1000000,"price_per_unit":4.7,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_video_seconds","op":"gt","value":0},{"path":"resolution","op":"in","value":["1080p"]}],"conditions":[{"path":"input_video_seconds","op":"gt","value":0},{"path":"resolution","op":"in","value":["1080p"]}],"priority":100,"effective_from":"2026-09-06T00:00:00Z"},
	],
};

// Copied from pricing/byteplus/bytedance-seedance-2.0-mini-260615/video.generate/pricing.json (source/note metadata dropped).
export const byteplusBytedanceSeedance20Mini260615Card = {
	key: "byteplus:bytedance/seedance-2.0-mini-260615:video.generate",
	api_provider_id: "byteplus",
	provider_slug: "byteplus",
	api_model_id: "bytedance/seedance-2.0-mini-260615",
	capability_id: "video.generate",
	rules: [
		{"meter":"total_tokens","unit":"token","unit_size":1000000,"price_per_unit":3.5,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_video_seconds","op":"eq","value":0}],"conditions":[{"path":"input_video_seconds","op":"eq","value":0}],"priority":100,"effective_from":"2026-09-06T00:00:00Z"},
		{"meter":"total_tokens","unit":"token","unit_size":1000000,"price_per_unit":2.1,"currency":"USD","pricing_plan":"standard","match":[{"path":"input_video_seconds","op":"gt","value":0}],"conditions":[{"path":"input_video_seconds","op":"gt","value":0}],"priority":100,"effective_from":"2026-09-06T00:00:00Z"},
	],
};

export const VIDEO_PRICE_CARDS: Record<string, { rules: ReadonlyArray<Record<string, unknown>> }> = {
	"ltx/ltx-2-3-fast": ltxLtx23FastCard,
	"ltx/ltx-2-3-pro": ltxLtx23ProCard,
	"ltx/ltx-2-5-fast": ltxLtx25FastCard,
	"ltx/ltx-2-5-pro": ltxLtx25ProCard,
	"black-forest-labs/black-forest-labs-flux-3-video": bflFlux3VideoCard,
	"google-vertex/google-veo-3.1-fast": googleVertexGoogleVeo31FastCard,
	"google-vertex/google-veo-3.1": googleVertexGoogleVeo31Card,
	"byteplus/bytedance-seedance-2.0": byteplusBytedanceSeedance20Card,
	"byteplus/bytedance-seedance-2.0-mini-260615": byteplusBytedanceSeedance20Mini260615Card,
};
