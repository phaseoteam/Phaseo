import type { IRVideoGenerationRequest } from "@core/ir";

export const GOOGLE_AI_STUDIO_OPERATION_PREFIX = "gaiop_";
export const GOOGLE_VERTEX_OPERATION_PREFIX = "gvtxop_";

export type GoogleVideoAuth =
	| { kind: "api_key"; value: string }
	| { kind: "oauth_bearer"; value: string };

function encodePrefixedBase64Id(prefix: string, value: string): string {
	const b64 = btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${prefix}${b64}`;
}

function decodePrefixedBase64Id(value: string, prefix: string): string | null {
	if (!value.startsWith(prefix)) return null;
	const b64 = value.slice(prefix.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

export function encodeGoogleAiStudioOperationId(operationName: string): string {
	return encodePrefixedBase64Id(GOOGLE_AI_STUDIO_OPERATION_PREFIX, operationName);
}

export function decodeGoogleAiStudioOperationId(videoId: string): string | null {
	return decodePrefixedBase64Id(videoId, GOOGLE_AI_STUDIO_OPERATION_PREFIX);
}

export function encodeGoogleVertexOperationId(operationName: string): string {
	return encodePrefixedBase64Id(GOOGLE_VERTEX_OPERATION_PREFIX, operationName);
}

export function decodeGoogleVertexOperationId(videoId: string): string | null {
	return decodePrefixedBase64Id(videoId, GOOGLE_VERTEX_OPERATION_PREFIX);
}

export function normalizeGoogleVideoModelName(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return trimmed;
	const withoutModelsPrefix = trimmed.replace(/^models\//i, "");
	const slashIndex = withoutModelsPrefix.indexOf("/");
	const canonical = slashIndex < 0 ? withoutModelsPrefix : withoutModelsPrefix.slice(slashIndex + 1);
	const aliasMap: Record<string, string> = {
		"veo-3.1-fast-preview": "veo-3.1-fast-generate-preview",
		"veo-3.1-preview": "veo-3.1-generate-preview",
		"veo-3-fast-preview": "veo-3.0-fast-generate-001",
		"veo-3-preview": "veo-3.0-generate-001",
		"veo-2": "veo-2.0-generate-001",
	};
	return aliasMap[canonical] ?? canonical;
}

export function resolveGoogleVideoAuth(rawCredential: string): GoogleVideoAuth {
	const trimmed = rawCredential.trim();
	if (/^Bearer\s+/i.test(trimmed)) {
		return { kind: "oauth_bearer", value: trimmed.replace(/^Bearer\s+/i, "").trim() };
	}
	if (trimmed.startsWith("ya29.") || trimmed.startsWith("eyJ")) {
		return { kind: "oauth_bearer", value: trimmed };
	}
	return { kind: "api_key", value: trimmed };
}

export function toGoogleVideoDurationSeconds(ir: IRVideoGenerationRequest): number | undefined {
	if (typeof ir.durationSeconds === "number" && Number.isFinite(ir.durationSeconds) && ir.durationSeconds > 0) {
		return ir.durationSeconds;
	}
	if (typeof ir.duration === "number" && Number.isFinite(ir.duration) && ir.duration > 0) {
		return ir.duration;
	}
	if (typeof ir.seconds === "number" && Number.isFinite(ir.seconds) && ir.seconds > 0) {
		return ir.seconds;
	}
	if (typeof ir.seconds === "string" && ir.seconds.trim().length > 0) {
		const parsed = Number(ir.seconds.trim());
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return undefined;
}

export function inferGoogleModelFromOperation(operationName: string): string | undefined {
	const match = operationName.match(/models\/([^/]+)\//);
	return match?.[1];
}

export function extractGoogleOperationError(payload: unknown): unknown {
	if (!payload || typeof payload !== "object") return undefined;
	return (payload as any).error;
}

export function isGoogleOperationsGetAuthFailure(status: number, payload: unknown): boolean {
	if (status !== 401) return false;
	if (!payload || typeof payload !== "object") return false;
	const error = (payload as any).error;
	const details = Array.isArray(error?.details) ? error.details : [];
	for (const detail of details) {
		const method = String(detail?.metadata?.method ?? "");
		const reason = String(detail?.reason ?? "");
		if (method === "google.longrunning.Operations.GetOperation" && reason === "CREDENTIALS_MISSING") {
			return true;
		}
	}
	return false;
}

export function redactSensitiveUrl(rawUrl: string): string {
	try {
		const url = new URL(rawUrl);
		if (url.searchParams.has("key")) url.searchParams.set("key", "[redacted]");
		return url.toString();
	} catch {
		return rawUrl;
	}
}
