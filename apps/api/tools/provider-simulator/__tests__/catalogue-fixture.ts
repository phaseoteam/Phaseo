// Catalogue routes and price cards the simulator sampled for anthropic and groq, copied from
// the catalogue snapshot (2026-10-28) so the unit tests do not read the catalogue files.
import type { PriceCard } from "@pipeline/pricing/types";
import type { CatalogueRoute } from "../src/catalogue";

export const SIM_CATALOGUE_ROUTES: Record<string, CatalogueRoute[]> = {
	"anthropic": [
		{"providerId": "anthropic", "apiModelId": "anthropic/claude-fable-5.1", "providerModelSlug": "claude-fable-5-1", "active": true, "routingStatus": "active", "inputModalities": ["text", "image"], "maxOutputTokens": 128000, "contextLength": 1000000, "capabilityParams": ["max_tokens", "stop", "reasoning", "include_reasoning", "tool_choice", "tools", "structured_outputs", "response_format", "verbosity", "reasoning_effort"], "capabilityStatus": "active", "serviceTiers": []},
	],
	"groq": [
		{"providerId": "groq", "apiModelId": "openai/gpt-oss-120b", "providerModelSlug": "openai/gpt-oss-120b", "active": true, "routingStatus": "active", "inputModalities": ["text"], "maxOutputTokens": 65536, "contextLength": 131072, "capabilityParams": ["reasoning", "include_reasoning", "max_tokens", "temperature", "top_p", "stop", "seed", "response_format", "tools", "tool_choice", "structured_outputs", "reasoning_effort"], "capabilityStatus": "active", "serviceTiers": []},
		{"providerId": "groq", "apiModelId": "qwen/qwen3.6-27b", "providerModelSlug": "qwen/qwen3.6-27b", "active": true, "routingStatus": "active", "inputModalities": ["text", "image"], "maxOutputTokens": 16384, "contextLength": 131072, "capabilityParams": [], "capabilityStatus": "active", "serviceTiers": []},
	],
};

export const SIM_CATALOGUE_PRICE_CARDS: Record<string, PriceCard> = {
	"anthropic:anthropic/claude-fable-5.1": {
		provider: "anthropic",
		model: "anthropic/claude-fable-5.1",
		endpoint: "text.generate",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: "catalogue-fixture",
		rules: [
			{"id": "anthropic:anthropic/claude-fable-5.1:0", "pricing_plan": "standard", "meter": "input_text_tokens", "unit": "token", "unit_size": 1000000, "price_per_unit": "10", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
			{"id": "anthropic:anthropic/claude-fable-5.1:1", "pricing_plan": "standard", "meter": "cached_read_text_tokens", "unit": "token", "unit_size": 1000000, "price_per_unit": "0.25", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
			{"id": "anthropic:anthropic/claude-fable-5.1:2", "pricing_plan": "standard", "meter": "output_text_tokens", "unit": "token", "unit_size": 1000000, "price_per_unit": "50", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
			{"id": "anthropic:anthropic/claude-fable-5.1:3", "pricing_plan": "standard", "meter": "cached_write_text_tokens_5m", "unit": "token", "unit_size": 1000000, "price_per_unit": "12.5", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
			{"id": "anthropic:anthropic/claude-fable-5.1:4", "pricing_plan": "standard", "meter": "cached_write_text_tokens_1h", "unit": "token", "unit_size": 1000000, "price_per_unit": "20", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
			{"id": "anthropic:anthropic/claude-fable-5.1:5", "pricing_plan": "batch", "meter": "input_text_tokens", "unit": "token", "unit_size": 1000000, "price_per_unit": "5", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
			{"id": "anthropic:anthropic/claude-fable-5.1:6", "pricing_plan": "batch", "meter": "output_text_tokens", "unit": "token", "unit_size": 1000000, "price_per_unit": "25", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
			{"id": "anthropic:anthropic/claude-fable-5.1:7", "pricing_plan": "standard", "meter": "native_web_search_requests", "unit": "request", "unit_size": 1, "price_per_unit": "0.01", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
		],
	} as PriceCard,
	"groq:openai/gpt-oss-120b": {
		provider: "groq",
		model: "openai/gpt-oss-120b",
		endpoint: "text.generate",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: "catalogue-fixture",
		rules: [
			{"id": "groq:openai/gpt-oss-120b:0", "pricing_plan": "standard", "meter": "cached_read_text_tokens", "unit": "token", "unit_size": 1000000, "price_per_unit": "0.075", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
			{"id": "groq:openai/gpt-oss-120b:1", "pricing_plan": "standard", "meter": "input_image_tokens", "unit": "token", "unit_size": 1000000, "price_per_unit": "0", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
			{"id": "groq:openai/gpt-oss-120b:2", "pricing_plan": "standard", "meter": "input_text_tokens", "unit": "token", "unit_size": 1000000, "price_per_unit": "0.15", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
			{"id": "groq:openai/gpt-oss-120b:3", "pricing_plan": "standard", "meter": "output_text_tokens", "unit": "token", "unit_size": 1000000, "price_per_unit": "0.6", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
		],
	} as PriceCard,
	"groq:qwen/qwen3.6-27b": {
		provider: "groq",
		model: "qwen/qwen3.6-27b",
		endpoint: "text.generate",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: "catalogue-fixture",
		rules: [
			{"id": "groq:qwen/qwen3.6-27b:0", "pricing_plan": "standard", "meter": "cached_read_text_tokens", "unit": "token", "unit_size": 1000000, "price_per_unit": "0.3", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
			{"id": "groq:qwen/qwen3.6-27b:1", "pricing_plan": "standard", "meter": "input_image_tokens", "unit": "token", "unit_size": 1000000, "price_per_unit": "0", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
			{"id": "groq:qwen/qwen3.6-27b:2", "pricing_plan": "standard", "meter": "input_text_tokens", "unit": "token", "unit_size": 1000000, "price_per_unit": "0.6", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
			{"id": "groq:qwen/qwen3.6-27b:3", "pricing_plan": "standard", "meter": "output_text_tokens", "unit": "token", "unit_size": 1000000, "price_per_unit": "3", "currency": "USD", "match": [], "priority": 100, "included_quantity": 0, "billing_timestamp_basis": "request_start", "time_windows": []},
		],
	} as PriceCard,
};
