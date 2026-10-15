import { getBindings } from "@/runtime/env";
import type { BatchProviderCredential } from "@core/batch-credentials";
import { readStreamTextWithLimit } from "@core/bounded-stream";
import { resolveVertexAccessToken } from "./auth";
import { googleUsageMetadataToIRUsage } from "@providers/google-ai-studio/usage";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";

export type VertexBatchStorage = {
	project: string;
	location: string;
	bucket: string;
	inputObject: string;
	outputPrefix: string;
};

export class VertexBatchPreDispatchError extends Error {}

function configuration() {
	const env = getBindings();
	const project = env.GOOGLE_VERTEX_PROJECT?.trim() ?? "";
	const location = env.GOOGLE_VERTEX_BATCH_LOCATION?.trim() ?? "";
	const bucket = env.GOOGLE_VERTEX_BATCH_BUCKET?.trim() ?? "";
	if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) ||
		!/^(global|[a-z]+-[a-z]+[0-9])$/.test(location) ||
		!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
		throw new VertexBatchPreDispatchError("vertex_batch_storage_not_configured");
	}
	return { project, location, bucket };
}

async function authorization(credential?: BatchProviderCredential): Promise<string> {
	if (!credential || credential.source !== "gateway") {
		throw new VertexBatchPreDispatchError("vertex_batch_requires_managed_credentials");
	}
	try {
		return `Bearer ${await resolveVertexAccessToken(credential.key)}`;
	} catch {
		throw new VertexBatchPreDispatchError("vertex_batch_credentials_unavailable");
	}
}

export async function fetchVertexBatchApi(args: {
	endpointPath: string; method: string; body?: BodyInit | null;
	credential?: BatchProviderCredential; signal?: AbortSignal | null;
}): Promise<Response> {
	const { project } = configuration();
	const projectNumber = getBindings().GOOGLE_VERTEX_PROJECT_NUMBER;
	const match = /^\/projects\/([^/]+)\/locations\/(global|[a-z]+-[a-z]+[0-9])\/batchPredictionJobs(?:\/(\d+)(:cancel)?)?$/.exec(args.endpointPath);
	if (!match || (match[1] !== project && (!projectNumber || match[1] !== projectNumber)) ||
		!((args.method === "GET" && !!match[3] && !match[4]) ||
			(args.method === "POST" && (!match[3] || !!match[4])))) {
		throw new VertexBatchPreDispatchError("invalid_vertex_batch_job_path");
	}
	const auth = await authorization(args.credential);
	const host = match[2] === "global" ? "aiplatform.googleapis.com" : `${match[2]}-aiplatform.googleapis.com`;
	// Errors after dispatch remain ambiguous: never wrap a network failure as a rejection.
	return fetch(`https://${host}/v1${args.endpointPath}`, {
		method: args.method, body: args.body ?? undefined,
		headers: { Authorization: auth, "Content-Type": "application/json" },
		redirect: "error", signal: args.signal ?? AbortSignal.timeout(60_000),
	});
}

function safeComponent(value: string): boolean {
	return /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

export async function prepareVertexBatch(args: {
	workspaceId: string; batchId: string; model: string;
	rows: Array<{ custom_id: string; body: unknown }>;
	credential: BatchProviderCredential;
}) {
	const config = configuration();
	if (!safeComponent(args.workspaceId) || !safeComponent(args.batchId) ||
		!/^gemini-[a-zA-Z0-9._-]+$/.test(args.model) || !args.rows.length || args.rows.length > 10_000) {
		throw new VertexBatchPreDispatchError("invalid_vertex_batch_input");
	}
	const storage: VertexBatchStorage = {
		...config,
		inputObject: `inputs/${args.workspaceId}/${args.batchId}.jsonl`,
		outputPrefix: `outputs/${args.workspaceId}/${args.batchId}/`,
	};
	const text = args.rows.map((row) => {
		const { model: _model, ...request } = row.body as Record<string, unknown>;
		return JSON.stringify({ phaseo_custom_id: row.custom_id, request });
	}).join("\n") + "\n";
	if (new TextEncoder().encode(text).byteLength > 20 * 1024 * 1024) {
		throw new VertexBatchPreDispatchError("vertex_batch_input_too_large");
	}
	const auth = await authorization(args.credential);
	const query = new URLSearchParams({ uploadType: "media", ifGenerationMatch: "0", name: storage.inputObject });
	const uploaded = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${config.bucket}/o?${query}`, {
		method: "POST", headers: { Authorization: auth, "Content-Type": "application/jsonl" },
		body: text, redirect: "error", signal: AbortSignal.timeout(30_000),
	});
	await uploaded.body?.cancel();
	if (!uploaded.ok) throw new VertexBatchPreDispatchError(`vertex_batch_input_upload_failed_${uploaded.status}`);
	return {
		storage,
		endpointPath: `/projects/${config.project}/locations/${config.location}/batchPredictionJobs`,
		body: {
			displayName: args.batchId,
			model: `publishers/google/models/${args.model}`,
			inputConfig: { instancesFormat: "jsonl", gcsSource: { uris: [`gs://${config.bucket}/${storage.inputObject}`] } },
			instanceConfig: { instanceType: "object", keyField: "phaseo_custom_id" },
			outputConfig: { predictionsFormat: "jsonl", gcsDestination: { outputUriPrefix: `gs://${config.bucket}/${storage.outputPrefix}` } },
		},
	};
}

export async function deleteVertexBatchInput(storage: VertexBatchStorage, credential: BatchProviderCredential): Promise<void> {
	const auth = await authorization(credential);
	const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(storage.bucket)}/o/${encodeURIComponent(storage.inputObject)}`, {
		method: "DELETE", headers: { Authorization: auth }, redirect: "error", signal: AbortSignal.timeout(30_000),
	});
	await response.body?.cancel();
	if (!response.ok && response.status !== 404) throw new Error("vertex_batch_input_cleanup_failed");
}

export function normalizeVertexBatchOutput(row: any): any {
	// Gemini preserves extra input columns; generic Vertex predictions use keyField.
	const customId = row?.phaseo_custom_id ?? row?.key;
	if (typeof customId !== "string" || !customId.trim()) throw new Error("vertex_batch_output_key_missing");
	const status = row.status;
	const error = row.error ?? (typeof status === "string" ? status.trim() || null : status?.code ? status : null);
	if (error) return { custom_id: customId, error };
	if (!row.response || typeof row.response !== "object") throw new Error("vertex_batch_output_response_missing");
	return { custom_id: customId, response: { status_code: 200, body: {
		...row.response,
		usage: row.response.usageMetadata ? normalizeTextUsageForPricing(googleUsageMetadataToIRUsage(row.response.usageMetadata)) : undefined,
		model: row.response.modelVersion,
	} } };
}

// Only read a persisted workspace-scoped prefix, never a URL returned by the provider.
export async function* vertexBatchOutputs(args: {
	storage?: VertexBatchStorage; workspaceId: string; credential: BatchProviderCredential; signal?: AbortSignal;
}): AsyncGenerator<any> {
	const storage = args.storage;
	const config = configuration();
	if (!storage || storage.project !== config.project || storage.bucket !== config.bucket ||
		!safeComponent(args.workspaceId) ||
		!new RegExp(`^outputs/${args.workspaceId}/[a-zA-Z0-9_-]{1,128}/$`).test(storage.outputPrefix)) {
		throw new Error("invalid_vertex_batch_output_scope");
	}
	const controller = new AbortController();
	const abort = () => controller.abort(args.signal?.reason);
	if (args.signal?.aborted) abort();
	else args.signal?.addEventListener("abort", abort, { once: true });
	const totalTimer = setTimeout(() => controller.abort(), 10 * 60_000);
	const signal = controller.signal;
	try {
		const auth = await authorization(args.credential);
		const base = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(storage.bucket)}/o`;
		const files = new Set<string>();
		const cursors = new Set<string>();
		let cursor: string | undefined;
		do {
			const query = new URLSearchParams({ prefix: storage.outputPrefix, maxResults: "100", fields: "items(name),nextPageToken" });
			if (cursor) query.set("pageToken", cursor);
			const response = await fetch(`${base}?${query}`, { headers: { Authorization: auth }, redirect: "error", signal });
			if (!response.ok) { await response.body?.cancel(); throw new Error(`vertex_batch_output_list_failed_${response.status}`); }
			const listing = JSON.parse(await readStreamTextWithLimit(response.body, 128 * 1024));
			for (const item of listing.items ?? []) {
				if (typeof item.name !== "string" || !item.name.startsWith(storage.outputPrefix)) throw new Error("invalid_vertex_batch_output_object");
				if (item.name.endsWith(".jsonl")) files.add(item.name);
			}
			cursor = listing.nextPageToken;
			if (files.size > 100 || cursors.size >= 100 || (cursor && cursors.has(cursor))) throw new Error("vertex_batch_output_file_limit");
			if (cursor) cursors.add(cursor);
		} while (cursor);
		if (!files.size) throw new Error("vertex_batch_outputs_unavailable");
		let totalBytes = 0;
		const ids = new Set<string>();
		const parse = (line: string) => {
			if (new TextEncoder().encode(line).byteLength > 8 * 1024 * 1024) throw new Error("vertex_batch_output_line_too_large");
			const row = normalizeVertexBatchOutput(JSON.parse(line));
			if (ids.has(row.custom_id) || ids.size >= 10_000) throw new Error("vertex_batch_output_key_duplicate_or_limit");
			ids.add(row.custom_id);
			return row;
		};
		for (const name of files) {
			const response = await fetch(`${base}/${encodeURIComponent(name)}?alt=media`, { headers: { Authorization: auth }, redirect: "error", signal });
			if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error(`vertex_batch_output_download_failed_${response.status}`); }
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let pending = "";
			try {
				while (true) {
					const idleTimer = setTimeout(() => controller.abort(), 30_000);
					let chunk: ReadableStreamReadResult<Uint8Array>;
					try { chunk = await reader.read(); } finally { clearTimeout(idleTimer); }
					signal.throwIfAborted();
					if (chunk.value) {
						totalBytes += chunk.value.byteLength;
						if (totalBytes > 512 * 1024 * 1024) throw new Error("vertex_batch_output_too_large");
						pending += decoder.decode(chunk.value, { stream: true });
					} else if (chunk.done) pending += decoder.decode();
					let newline: number;
					while ((newline = pending.indexOf("\n")) >= 0) {
						if (newline > 8 * 1024 * 1024) throw new Error("vertex_batch_output_line_too_large");
						const line = pending.slice(0, newline).trim();
						pending = pending.slice(newline + 1);
						if (line) yield parse(line);
					}
					if (pending.length > 8 * 1024 * 1024) throw new Error("vertex_batch_output_line_too_large");
					if (chunk.done) { if (pending.trim()) yield parse(pending); break; }
				}
			} finally {
				await reader.cancel().catch(() => undefined);
				reader.releaseLock();
			}
		}
	} finally {
		clearTimeout(totalTimer);
		args.signal?.removeEventListener("abort", abort);
		controller.abort();
	}
}
