import { JSONParser, TokenType } from "@streamparser/json";
import type { BatchJobMeta } from "@core/batch-jobs";
import {
	ANTHROPIC_BATCH_PROVIDER_ID, GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID, MISTRAL_BATCH_PROVIDER_ID,
	X_AI_BATCH_PROVIDER_ID, FILE_BACKED_JSONL_BATCH_PROVIDERS, batchText,
	buildProviderRetrievePath, fetchProviderBatchApi, fetchProviderFileContent,
} from "@core/batch-provider-adapters";

const encoder = new TextEncoder();
const newline = new Uint8Array([10]);
const MAX_INLINE_ROW_BYTES = 8 * 1024 * 1024;
const PARSE_CHUNK_BYTES = 16 * 1024;
const MAX_RESULTS_PAGES = 1000;

export function supportsBatchResults(provider: string): boolean {
	return FILE_BACKED_JSONL_BATCH_PROVIDERS.has(provider) ||
		[ANTHROPIC_BATCH_PROVIDER_ID, GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID, MISTRAL_BATCH_PROVIDER_ID, X_AI_BATCH_PROVIDER_ID].includes(provider);
}

export class BatchResultsError extends Error {
	constructor(readonly reason: string, readonly providerStatus?: number, readonly providerRequestId?: string | null) {
		super(reason);
		this.name = "BatchResultsError";
	}
}

type Cancellable = { cancel(reason?: unknown): Promise<void> };

// Own every response/reader until EOF so cancellation also closes prefetched files.
class DownloadContext {
	readonly abort = new AbortController();
	private readonly open = new Set<Cancellable>();
	async response(response: Response): Promise<Response> {
		if (!response.ok || !response.body) {
			await response.body?.cancel().catch(() => undefined);
			throw new BatchResultsError("provider_http_error", response.status, response.headers.get("request-id"));
		}
		this.open.add(response.body);
		return response;
	}
	async *chunks(response: Response): AsyncGenerator<Uint8Array> {
		const body = response.body!;
		const reader = body.getReader();
		this.open.delete(body);
		this.open.add(reader);
		try {
			while (true) {
				this.abort.signal.throwIfAborted();
				const next = await reader.read();
				this.abort.signal.throwIfAborted();
				if (next.done) return;
				if (next.value.length) yield next.value;
			}
		} finally {
			await reader.cancel().catch(() => undefined);
			reader.releaseLock();
			this.open.delete(reader);
		}
	}
	async close(): Promise<void> {
		this.abort.abort();
		await Promise.allSettled([...this.open].map((body) => body.cancel()));
		this.open.clear();
	}
	async api(provider: string, endpointPath: string): Promise<Response> {
		this.abort.signal.throwIfAborted();
		return this.response(await fetchProviderBatchApi(provider, { endpointPath, method: "GET", redirect: "manual", signal: this.abort.signal }));
	}
	async *files(provider: string, ids: string[]): AsyncGenerator<Uint8Array> {
		const responses: Response[] = [];
		// Check both success/error files before exposing any bytes to the customer.
		for (const id of [...new Set(ids)]) {
			this.abort.signal.throwIfAborted();
			responses.push(await this.response(await fetchProviderFileContent(provider, id, { redirect: "manual", signal: this.abort.signal })));
		}
		for (let index = 0; index < responses.length; index++) {
			let lastByte: number | undefined;
			for await (const chunk of this.chunks(responses[index])) {
				lastByte = chunk[chunk.length - 1];
				yield chunk;
			}
			if (index < responses.length - 1 && lastByte !== undefined && lastByte !== 10) yield newline;
		}
	}
}

type JsonResultMetadata = { files: string[]; paginationToken?: string; rows: number };
// Match the same REST/SDK envelopes as extractGoogleInlineResponses.
const GOOGLE_ROW_PATHS = [
	"$.dest.inlinedResponses", "$.dest.inlinedEmbedContentResponses",
	"$.response.inlinedResponses", "$.response.inlinedEmbedContentResponses",
	"$.metadata.output.inlinedResponses", "$.metadata.output.inlinedEmbedContentResponses",
	"$.inlinedResponses",
].flatMap((path) => [`${path}.*`, `${path}.inlinedResponses.*`]);
const GOOGLE_FILE_PATHS = ["$.dest.fileName", "$.dest.file_name", "$.response.responsesFile", "$.response.responses_file", "$.metadata.output.responsesFile", "$.metadata.output.responses_file"];

async function* jsonRows(
	context: DownloadContext, response: Response, rowPaths: string[], metadataPaths: string[], metadata: JsonResultMetadata,
): AsyncGenerator<Uint8Array> {
	const queue: Uint8Array[] = [];
	let selectedRows: unknown;
	let bytesSinceValue = 0;
	const parser = new JSONParser({ paths: [...rowPaths, ...metadataPaths], keepStack: false, stringBufferSize: 64 * 1024 });
	let depth = 0;
	let previousToken: TokenType | undefined;
	let rootArrayKey = false;
	let rootArraySeen = false;
	const expectedRootArray = rowPaths.length === 1 && rowPaths[0] === "$.results.*" ? "results" : undefined;
	parser.onToken = ({ token, value }) => {
		if (expectedRootArray && depth === 1) {
			if (rootArrayKey && previousToken === TokenType.COLON) {
				if (token !== TokenType.LEFT_BRACKET) throw new BatchResultsError("invalid_results_array");
				rootArraySeen = true;
				rootArrayKey = false;
			} else if (token === TokenType.STRING && (previousToken === TokenType.LEFT_BRACE || previousToken === TokenType.COMMA)) {
				rootArrayKey = value === expectedRootArray;
			}
		}
		if (token === TokenType.LEFT_BRACE || token === TokenType.LEFT_BRACKET) {
			if (++depth > 128) throw new BatchResultsError("result_nesting_too_deep");
		} else if (token === TokenType.RIGHT_BRACE || token === TokenType.RIGHT_BRACKET) depth--;
		previousToken = token;
	};
	parser.onValue = ({ value, key, parent }) => {
		if (typeof key === "number") {
			// Operation metadata can mirror the final response; emit one result collection.
			selectedRows ??= parent;
			if (selectedRows !== parent) {
				if (Array.isArray(parent)) parent.length = 0;
				bytesSinceValue = 0;
				return;
			}
			if (!value || typeof value !== "object" || Array.isArray(value)) throw new BatchResultsError("invalid_result_row");
			const encoded = encoder.encode(`${JSON.stringify(value)}\n`);
			if (encoded.length > MAX_INLINE_ROW_BYTES) throw new BatchResultsError("inline_result_row_too_large");
			queue.push(encoded);
			metadata.rows++;
			// Overlapping direct/nested envelope selectors can select an ancestor array.
			// Drop each emitted row explicitly so that ancestor cannot retain the batch.
			if (Array.isArray(parent)) parent.length = 0;
		} else if (key === "pagination_token") {
			metadata.paginationToken = batchText(value) ?? undefined;
		} else {
			const file = batchText(value);
			if (file) metadata.files.push(file);
		}
		bytesSinceValue = 0;
	};
	for await (const chunk of context.chunks(response)) {
		for (let offset = 0; offset < chunk.length; offset += PARSE_CHUNK_BYTES) {
			const slice = chunk.subarray(offset, offset + PARSE_CHUNK_BYTES);
			bytesSinceValue += slice.length;
			if (bytesSinceValue > MAX_INLINE_ROW_BYTES) throw new BatchResultsError("inline_result_row_too_large");
			parser.write(slice);
			while (queue.length) yield queue.shift()!;
		}
	}
	if (!parser.isEnded) parser.end();
	if (expectedRootArray && !rootArraySeen) throw new BatchResultsError("missing_results_array");
	while (queue.length) yield queue.shift()!;
}

function storedFiles(meta: BatchJobMeta): string[] {
	return [batchText(meta.outputFileId), batchText(meta.errorFileId)].filter((id): id is string => !!id);
}

async function* resultChunks(context: DownloadContext, meta: BatchJobMeta): AsyncGenerator<Uint8Array> {
	const provider = meta.provider;
	const files = storedFiles(meta);
	if (files.length) {
		yield* context.files(provider, files);
		return;
	}
	const nativeId = batchText(meta.nativeBatchId);
	if (!nativeId) throw new BatchResultsError("results_unavailable");
	if (provider === ANTHROPIC_BATCH_PROVIDER_ID) {
		yield* context.chunks(await context.api(provider, `/messages/batches/${encodeURIComponent(nativeId)}/results`));
		return;
	}
	if (provider === X_AI_BATCH_PROVIDER_ID) {
		let token: string | undefined;
		const seen = new Set<string>();
		for (let page = 0; page < MAX_RESULTS_PAGES; page++) {
			const query = new URLSearchParams({ limit: "1000" });
			if (token) query.set("pagination_token", token);
			const response = await context.api(provider, `/batches/${encodeURIComponent(nativeId)}/results?${query}`);
			const metadata: JsonResultMetadata = { files: [], rows: 0 };
			yield* jsonRows(context, response, ["$.results.*"], ["$.pagination_token"], metadata);
			token = metadata.paginationToken;
			if (!token) return;
			if (seen.has(token)) throw new BatchResultsError("repeated_results_cursor");
			seen.add(token);
		}
		throw new BatchResultsError("results_page_limit_exceeded");
	}
	const path = buildProviderRetrievePath(provider, nativeId);
	const response = await context.api(provider, path);
	const metadata: JsonResultMetadata = { files: [], rows: 0 };
	const isGoogle = provider === GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID;
	const rowPaths = isGoogle ? GOOGLE_ROW_PATHS : [];
	const filePaths = isGoogle ? GOOGLE_FILE_PATHS : ["$.output_file", "$.output_file_id", "$.error_file", "$.error_file_id", "$.job.output_file_id", "$.job.error_file_id"];
	// Inline rows contain success/error records together; never also download their file mirror.
	yield* jsonRows(context, response, rowPaths, filePaths, metadata);
	if (metadata.rows) return;
	if (metadata.files.length) {
		yield* context.files(provider, metadata.files);
		return;
	}
	if (provider === MISTRAL_BATCH_PROVIDER_ID) {
		// Prefer separate success/error files; only use inline output when there are no files.
		yield* jsonRows(context, await context.api(provider, `${path}?inline=true`), ["$.outputs.*"], [], metadata);
		if (metadata.rows) return;
	}
	throw new BatchResultsError("results_unavailable");
}

export async function openBatchResultsStream(meta: BatchJobMeta, options: {
	signal?: AbortSignal;
	onStreamError?: (error: unknown) => void;
} = {}): Promise<ReadableStream<Uint8Array>> {
	if (!supportsBatchResults(meta.provider)) throw new BatchResultsError("unsupported_provider");
	const context = new DownloadContext();
	const onAbort = () => { void context.close(); };
	options.signal?.addEventListener("abort", onAbort, { once: true });
	if (options.signal?.aborted) onAbort();
	const iterator = resultChunks(context, meta);
	const finish = async () => {
		options.signal?.removeEventListener("abort", onAbort);
		await context.close();
	};
	let first: IteratorResult<Uint8Array>;
	try {
		first = await iterator.next();
	} catch (error) {
		await finish();
		throw error;
	}
	let initial = true;
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const next = initial ? first : await iterator.next();
				initial = false;
				if (next.done) { await finish(); controller.close(); }
				else controller.enqueue(next.value);
			} catch (error) {
				await finish();
				controller.error(new Error("batch_results_stream_failed"));
				options.onStreamError?.(error);
			}
		},
		async cancel() {
			await finish();
			await iterator.return(undefined);
		},
	}, { highWaterMark: 0 });
}
