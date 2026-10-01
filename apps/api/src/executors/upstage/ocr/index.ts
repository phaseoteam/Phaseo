import type { IROcrRequest, IROcrResponse } from "@core/ir";
import type { ProviderExecutor } from "@executors/types";
import { resolveOpenAICompatKey, resolveOpenAICompatConfig } from "@providers/openai-compatible/config";
import { fetchPublicMedia } from "@core/public-media-fetch";

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IROcrRequest;
	const fail = (message: string) => ({ kind: "completed" as const, upstream: Response.json({ error: { message } }, { status: 400 }), bill: { cost_cents: 0, currency: "USD" } });
	const model = args.providerModelSlug || ir.model;
	if (!["ocr", "document-parse"].includes(model)) return fail("Unsupported Upstage document model.");
	const requestedMode = ir.rawRequest?.mode ?? ir.rawRequest?.config?.upstage?.mode;
	if (requestedMode !== undefined && requestedMode !== "standard") return fail("This Upstage adapter supports Standard mode only.");
	for (const name of ["pages", "imageLimit", "imageMinSize", "bboxAnnotationFormat", "documentAnnotationFormat", "documentAnnotationPrompt", "extractHeader", "extractFooter", "confidenceScoresGranularity"] as const) {
		if (ir[name] !== undefined && ir[name] !== null) return fail(`Upstage does not support ${name}.`);
	}
	if (model === "ocr" && (ir.includeImageBase64 || ir.tableFormat)) return fail("Upstage OCR does not support image crops or table formatting.");
	const document = ir.document;
	const url = ir.image ?? (document?.type === "document_url" ? document.document_url : document?.type === "image_url" ? typeof document.image_url === "string" ? document.image_url : document.image_url.url : undefined);
	if (!url) return fail("Upstage document processing requires an image or document URL.");
	let blob: Blob;
	if (url.startsWith("data:")) {
		const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
		if (!match || match[2].length > 70 * 1024 * 1024) return fail("Invalid or oversized document data URL.");
		try { const binary = atob(match[2]); blob = new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], { type: match[1] }); } catch { return fail("Invalid document base64."); }
	} else {
		const media = await fetchPublicMedia({ url, maxBytes: 50 * 1024 * 1024, upstreamTiming: args.upstreamTiming });
		blob = new Blob([media.bytes as Uint8Array<ArrayBuffer>], { type: media.contentType ?? "application/pdf" });
	}
	if (blob.size > 50 * 1024 * 1024) return fail("Upstage documents must not exceed 50 MB.");
	const body = new FormData(); body.set("model", model); body.set("document", blob, document?.type === "document_url" && document.document_name ? document.document_name : "document");
	if (model === "document-parse") {
		body.set("output_formats", JSON.stringify(["text", ir.tableFormat ?? "markdown"]));
		body.set("mode", "standard");
		if (ir.includeImageBase64) body.set("base64_encoding", JSON.stringify(["figure", "table"]));
	}
	const key = resolveOpenAICompatKey({ ...args, forceGatewayKey: args.meta.forceGatewayKey });
	const base = resolveOpenAICompatConfig(args.providerId).baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
	const upstream = await (args.upstreamTiming?.fetch ?? fetch)(`${base}/v1/document-digitization`, { method: "POST", headers: { Authorization: `Bearer ${key.key}` }, body });
	const raw: any = await upstream.clone().json().catch(() => null);
	const common = { upstream, rawResponse: raw, keySource: key.source, byokKeyId: key.byokId };
	if (!upstream.ok) return { kind: "completed", ...common, bill: { cost_cents: 0, currency: "USD" } };
	const pageMetadata = raw?.metadata?.pages ?? [...new Set((raw?.elements ?? []).map((element: any) => element.page))].map(page => ({ page }));
	const pages = model === "ocr" ? raw?.pages : pageMetadata.map((page: any) => {
		const elements = (raw.elements ?? []).filter((element: any) => element.page === page.page);
		return { index: page.page - 1, width: page.width, height: page.height, markdown: elements.map((element: any) => element.content?.[ir.tableFormat ?? "markdown"] ?? element.content?.text ?? "").join("\n\n"), ...(ir.includeBlocks ? { elements } : {}), ...(ir.includeImageBase64 ? { images: elements.filter((element: any) => element.base64_encoding).map((element: any) => ({ id: String(element.id), image_base64: element.base64_encoding })) } : {}) };
	});
	const billedPages = raw?.numBilledPages ?? raw?.usage?.pages;
	const usage = { requests: 1, ...(typeof billedPages === "number" ? { input_pages: billedPages } : {}) };
	const response: IROcrResponse = { id: args.requestId, model, provider: args.providerId, text: raw?.text ?? raw?.content?.text ?? raw?.content?.markdown ?? "", pages, usage: usage as any, rawResponse: raw };
	return { kind: "completed", ...common, ir: response, bill: { cost_cents: 0, currency: "USD", usage, finish_reason: "stop" } };
};
