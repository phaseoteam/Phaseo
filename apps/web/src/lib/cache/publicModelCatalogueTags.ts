export const PUBLIC_MODEL_CATALOGUE_CACHE_LIFE = "max" as const;

export const PUBLIC_MODEL_CATALOGUE_TAG = "public-model-catalogue" as const;

export const MODEL_LIST_TAGS = [
	PUBLIC_MODEL_CATALOGUE_TAG,
	"frontend:models",
	"data:models",
	"models:list-base",
	"frontend:model-notice",
	"data:data_api_model_page_notices",
] as const;

export const GATEWAY_MODEL_LIST_TAGS = [
	PUBLIC_MODEL_CATALOGUE_TAG,
	"gateway-supported-models",
	"frontend:gateway-models",
] as const;

export const MODEL_ALIAS_TAGS = [
	...GATEWAY_MODEL_LIST_TAGS,
	"data:model_aliases",
	"data:data_api_model_aliases",
] as const;
