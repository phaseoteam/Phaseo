import { isSecretReference } from "./secretReferences";

/**
 * Sending the app's trace spans (the ones Settings → Diagnostics reads) to an OpenTelemetry collector over OTLP/HTTP JSON.
 * Spans carry names, timings, outcomes and redacted metadata, never chat text.
 */
export type TraceExport = { endpoint: string | null; headers: Record<string, string> };
export const defaultTraceExport: TraceExport = { endpoint: null, headers: {} };

/** Header names that carry credentials: their values must be references (op://… or env:NAME), never saved as text. */
const credentialHeader = /authorization|token|key|secret|password|cookie/i;

export function validateTraceExport(value: unknown): TraceExport {
	if (value === undefined || value === null) return { ...defaultTraceExport, headers: {} };
	if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid trace export settings.");
	const input = value as Record<string, unknown>;
	const endpoint = input.endpoint === undefined || input.endpoint === null || input.endpoint === "" ? null : input.endpoint;
	if (endpoint !== null) {
		let url: URL;
		try { url = new URL(String(endpoint)); } catch { throw new Error("Enter the collector's address, such as https://otel.example.com or http://localhost:4318."); }
		const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
		if (typeof endpoint !== "string" || endpoint.length > 500 || url.username || url.password || !(url.protocol === "https:" || (url.protocol === "http:" && local))) throw new Error("Use an https:// collector address, or http:// only on this computer (localhost).");
	}
	const headers = input.headers === undefined ? {} : input.headers;
	if (!headers || typeof headers !== "object" || Array.isArray(headers)) throw new Error("Invalid trace export headers.");
	const entries = Object.entries(headers as Record<string, unknown>);
	if (entries.length > 10) throw new Error("Keep trace export to 10 headers.");
	for (const [name, text] of entries) {
		if (!/^[A-Za-z0-9-]{1,100}$/.test(name) || typeof text !== "string" || text.length > 2000 || text.includes("\n")) throw new Error(`Invalid trace export header ${name.slice(0, 40)}.`);
		if (credentialHeader.test(name) && !isSecretReference(text)) throw new Error(`The ${name} header carries a credential, so give it as a reference: op://vault/item/field (1Password) or env:NAME.`);
	}
	return { endpoint: endpoint as string | null, headers: Object.fromEntries(entries) as Record<string, string> };
}

/** The OTLP/HTTP traces address for a collector given as its base, or already ending in /v1/traces. */
export const tracesUrl = (endpoint: string) => /\/v1\/traces\/?$/.test(endpoint) ? endpoint : `${endpoint.replace(/\/+$/, "")}/v1/traces`;
