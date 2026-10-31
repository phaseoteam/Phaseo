// Purpose: Media fields shared by the Chat Completions and Responses encoders.
// Why: Image `detail` values and video part shapes differ between the
//      OpenAI-compatible providers, and both encoders must agree.
// How: Small helpers keyed on the provider's documented schema.

// Providers whose image `detail` enum includes "original" (OpenAI's ImageDetail,
// and the published specs of Azure, Moonshot AI, Nebius Token Factory and Venice).
// The others document only auto/low/high, so "original" is sent as "high", the
// closest level they accept.
// https://platform.openai.com/docs/guides/images-vision#specify-image-input-detail-level
const IMAGE_DETAIL_ORIGINAL_PROVIDERS = new Set([
	"openai", "openai-eu", "azure",
	"moonshot-ai", "moonshotai", "moonshot-ai-turbo", "moonshotai-turbo",
	"nebius-token-factory", "nebius-token-factory-eu-north-1", "nebius-token-factory-us-central-1",
	"venice",
]);

export function imageDetailForProvider(
	detail: "auto" | "low" | "high" | "original" | undefined,
	providerId: string | undefined,
): "auto" | "low" | "high" | "original" | undefined {
	if (detail !== "original") return detail;
	return providerId && IMAGE_DETAIL_ORIGINAL_PROVIDERS.has(providerId) ? "original" : "high";
}

export function unsupportedImageFileIdError(api: string): Error {
	return Object.assign(
		new Error(`This provider's ${api} API cannot read an image by file_id; send the image as a URL or base64 data.`),
		{ code: "unsupported_parameter", param: "file_id" },
	);
}
