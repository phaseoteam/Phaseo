import type { IRRerankRequest, IRRerankResponse } from "@core/ir";
import type { ProviderExecutor } from "@executors/types";
import { resolveOpenAICompatKey } from "@providers/openai-compatible/config";

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRRerankRequest;
	const fail = (status: number, message: string) => ({ kind: "completed" as const, upstream: Response.json({ error: { message } }, { status }), bill: { cost_cents: 0, currency: "USD" } });
	for (const name of ["maxChunksPerDoc", "maxTokensPerDoc", "rankFields", "priority", "serviceTier"] as const) if (ir[name] !== undefined) return fail(400, `Relace rank does not support ${name}.`);
	const codebase = ir.documents.map((document, index) => ({ filename: typeof document === "object" && typeof document.filename === "string" ? document.filename : `document_${index}`, content: typeof document === "string" ? document : document.content }));
	if (codebase.some(document => typeof document.content !== "string")) return fail(400, "Relace documents must be text or objects with filename and content.");
	if (new Set(codebase.map(document => document.filename)).size !== codebase.length) return fail(400, "Relace document filenames must be unique.");
	const tokenLimit = ir.vendor?.provider_options?.relace?.token_limit;
	if (tokenLimit !== undefined && (!Number.isInteger(tokenLimit) || tokenLimit <= 0)) return fail(400, "token_limit must be a positive integer.");
	const key = resolveOpenAICompatKey({ ...args, forceGatewayKey: args.meta.forceGatewayKey });
	const upstream = await (args.upstreamTiming?.fetch ?? fetch)("https://ranker.endpoint.relace.run/v2/code/rank", { method: "POST", headers: { Authorization: `Bearer ${key.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: ir.query, codebase, ...(tokenLimit !== undefined ? { token_limit: tokenLimit } : {}) }) });
	const raw: any = await upstream.clone().json().catch(() => null);
	const common = { upstream, rawResponse: raw, keySource: key.source, byokKeyId: key.byokId };
	if (!upstream.ok) return { kind: "completed", ...common, bill: { cost_cents: 0, currency: "USD" } };
	if (!Array.isArray(raw?.results)) return fail(502, "Relace returned invalid ranking results.");
	const indices = new Map(codebase.map((document, index) => [document.filename, index]));
	if (raw.results.some((result: any) => !indices.has(result.filename) || typeof result.score !== "number" || !Number.isFinite(result.score))) return fail(502, "Relace returned an unknown document or invalid score.");
	const results = raw.results.map((result: any) => { const index = indices.get(result.filename)!; return { index, relevanceScore: result.score, ...(ir.returnDocuments ? { document: ir.documents[index] } : {}) }; }).sort((a: any, b: any) => b.relevanceScore - a.relevanceScore).slice(0, ir.topN ?? raw.results.length);
	const tokens = raw.usage?.total_tokens;
	const usage = typeof tokens === "number" ? { input_text_tokens: tokens, requests: 1 } : { requests: 1 };
	const response: IRRerankResponse = { id: args.requestId, model: args.providerModelSlug || ir.model, results, usage: typeof tokens === "number" ? { inputTokens: tokens, totalTokens: tokens } : undefined, rawResponse: raw };
	return { kind: "completed", ...common, ir: response, bill: { cost_cents: 0, currency: "USD", usage, finish_reason: "stop" } };
};
