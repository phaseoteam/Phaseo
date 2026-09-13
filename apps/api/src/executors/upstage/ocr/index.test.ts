import { afterEach, beforeEach, expect, it } from "vitest";
import { executor } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
beforeEach(() => setupRuntimeFromEnv({ UPSTAGE_API_KEY: "test-key" } as any));
afterEach(teardownTestRuntime);
it.each(["ocr", "document-parse"])("maps native %s multipart requests and billed page counts", async model => {
	let body: FormData | undefined;
	const mock = installFetchMock([{ match: (url, init) => { body = init?.body as FormData; return url.endsWith("/v1/document-digitization"); }, response: jsonResponse(model === "ocr" ? { text: "Document", pages: [{ id: 0, text: "Document" }], numBilledPages: 1 } : { content: { text: "Document" }, elements: [{ page: 1, content: { markdown: "**Document**" } }], usage: { pages: 1 } }) }]);
	try {
		const result = await executor({ ir: { model, image: "data:image/png;base64,aW1hZ2U=" }, providerId: "upstage", endpoint: "ocr", requestId: "test", workspaceId: "test", byokMeta: [], pricingCard: {}, meta: {} });
		expect(body?.get("model")).toBe(model); expect(body?.get("document")).toBeInstanceOf(Blob);
		expect(result.bill.usage?.input_pages).toBe(1);
		expect(result.kind === "completed" && result.ir).toMatchObject({ text: "Document", pages: [expect.any(Object)] });
	} finally { mock.restore(); }
});
