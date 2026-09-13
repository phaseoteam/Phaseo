import { getEffectiveRoutingHints } from "../requestRouting";
import type { Endpoint } from "@core/types";

export type GatewayRoutingRegion = "eu" | "us";

const REGIONAL_TEXT_ENDPOINTS = new Set<Endpoint>([
	"chat.completions",
	"responses",
	"messages",
]);
const NON_TEXT_CONTENT_TYPES = new Set([
	"audio",
	"document",
	"file",
	"image",
	"image_url",
	"input_audio",
	"input_file",
	"input_image",
	"input_video",
	"video",
]);
const ALLOWED_TOOL_TYPES = new Set(["function", "custom"]);

export type RegionalRequestViolation = {
	reason: "endpoint_not_supported" | "non_text_content" | "non_text_output" | "hosted_tool_not_supported";
	path: string[];
	value?: string;
};

type DeploymentRegionResult =
	| { ok: true; body: any; region: GatewayRoutingRegion | null }
	| {
			ok: false;
			region: GatewayRoutingRegion;
			field: "required_execution_region" | "required_data_region";
			requestedRegion: string;
	  };

export function normalizeGatewayRoutingRegion(
	value: string | null | undefined,
): GatewayRoutingRegion | null {
	const normalized = String(value ?? "").trim().toLowerCase();
	return normalized === "eu" || normalized === "us" ? normalized : null;
}

function findNonTextContent(value: unknown, path: string[]): RegionalRequestViolation | null {
	if (!value || typeof value !== "object") return null;
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) {
			const violation = findNonTextContent(value[index], [...path, String(index)]);
			if (violation) return violation;
		}
		return null;
	}
	const record = value as Record<string, unknown>;
	const type = typeof record.type === "string" ? record.type.trim().toLowerCase() : null;
	if (type && NON_TEXT_CONTENT_TYPES.has(type)) {
		return { reason: "non_text_content", path: [...path, "type"], value: type };
	}
	if (record.attachments !== undefined) {
		return { reason: "non_text_content", path: [...path, "attachments"] };
	}
	for (const key of ["content", "input", "messages"]) {
		if (record[key] === undefined) continue;
		const violation = findNonTextContent(record[key], [...path, key]);
		if (violation) return violation;
	}
	return null;
}

export function validateRegionalTextRequest(
	endpoint: Endpoint,
	body: any,
	configuredRegion: string | null | undefined,
): RegionalRequestViolation | null {
	if (!normalizeGatewayRoutingRegion(configuredRegion)) return null;
	if (!REGIONAL_TEXT_ENDPOINTS.has(endpoint)) {
		return { reason: "endpoint_not_supported", path: [] };
	}
	for (const key of ["web_search_options", "webSearchOptions"] as const) {
		if (body?.[key] !== undefined && body[key] !== null) {
			return {
				reason: "hosted_tool_not_supported",
				path: [key],
			};
		}
	}

	if (Array.isArray(body?.modalities)) {
		const nonText = body.modalities.find(
			(value: unknown) => String(value).trim().toLowerCase() !== "text",
		);
		if (nonText !== undefined) {
			return { reason: "non_text_output", path: ["modalities"], value: String(nonText) };
		}
	}
	for (const key of ["audio", "image", "video", "attachments", "input_file_id"]) {
		if (body?.[key] !== undefined && body[key] !== null) {
			return { reason: "non_text_content", path: [key] };
		}
	}

	const contentViolation = findNonTextContent(
		{ messages: body?.messages, input: body?.input },
		[],
	);
	if (contentViolation) return contentViolation;

	if (Array.isArray(body?.tools)) {
		for (let index = 0; index < body.tools.length; index += 1) {
			const tool = body.tools[index];
			if (!tool || typeof tool !== "object") continue;
			const rawType = (tool as Record<string, unknown>).type;
			if (rawType === undefined) continue;
			const type = String(rawType).trim().toLowerCase();
			if (type && !ALLOWED_TOOL_TYPES.has(type)) {
				return {
					reason: "hosted_tool_not_supported",
					path: ["tools", String(index), "type"],
					value: type,
				};
			}
		}
	}
	return null;
}

function normalizeRequestedRegion(value: string | null): string | null {
	const normalized = String(value ?? "").trim().toLowerCase();
	return normalized || null;
}

/**
 * Applies the Worker deployment's regional routing boundary after request,
 * preset, and dynamic-route defaults have been merged. Callers may repeat the
 * boundary, but cannot weaken or replace it.
 */
export function applyDeploymentRegionPolicy(
	body: any,
	configuredRegion: string | null | undefined,
): DeploymentRegionResult {
	const region = normalizeGatewayRoutingRegion(configuredRegion);
	if (!region) return { ok: true, body, region: null };

	const hints = getEffectiveRoutingHints(body);
	const requestedExecutionRegion = normalizeRequestedRegion(
		hints.requiredExecutionRegion,
	);
	const requestedDataRegion = normalizeRequestedRegion(hints.requiredDataRegion);

	if (requestedExecutionRegion && requestedExecutionRegion !== region) {
		return {
			ok: false,
			region,
			field: "required_execution_region",
			requestedRegion: requestedExecutionRegion,
		};
	}
	if (requestedDataRegion && requestedDataRegion !== region) {
		return {
			ok: false,
			region,
			field: "required_data_region",
			requestedRegion: requestedDataRegion,
		};
	}

	return {
		ok: true,
		region,
		body: {
			...body,
			modalities: ["text"],
			provider: {
				...hints.provider,
				...hints.merged,
				required_execution_region: region,
				required_data_region: region,
			},
		},
	};
}
