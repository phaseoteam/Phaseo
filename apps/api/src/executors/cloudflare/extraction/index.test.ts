import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExtractionsSchema } from "@core/extraction";
import { decodeExtractionRequest, encodeExtractionResponse } from "@protocols/extraction";
import { resolveProviderExecutor } from "@executors/index";
import type { ExecutorExecuteArgs } from "@executors/types";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const request = { model: "cloudflare/clairic", input: "Invoice total $1080", fields: { total: { type: "number" as const, decimals: 2 }, po: { type: "text" as const } } };
const payload = () => ({ model: "clairic", truncated: false,
  answers: { total: { type: "number", value: 1080, confidence: 0.99, p_null: 0.01 },
    po: { type: "text", value: null, guess: "1080", span: [0, 4], confidence: 0.9, p_null: 0.99 } },
  usage: { input_tokens: 655, output_tokens: 0, state_tokens: 61, schema_tokens: 472, passes: 3 },
});
const execute = resolveProviderExecutor("cloudflare", "extraction.extract")!;
const args = (): ExecutorExecuteArgs => ({ ir: decodeExtractionRequest(ExtractionsSchema.parse(request)),
  requestId: "req_extract", workspaceId: "test", providerId: "cloudflare", endpoint: "extractions",
  protocol: "phaseo.extractions", capability: "extraction.extract", providerModelSlug: "@cf/cloudflare/clairic",
  byokMeta: [], pricingCard: { rules: [] }, meta: {} });
beforeEach(() => setupRuntimeFromEnv({ CLOUDFLARE_ACCOUNT_ID: "account-test", CLOUDFLARE_API_TOKEN: "cf-test" }));
afterEach(teardownTestRuntime);

describe("Cloudflare extraction contract", () => {

  it("maps image-only evidence and explicit date context through the IR", async () => {
    const mock = installFetchMock([{ match: () => true, response: jsonResponse(payload()) }]);
    try {
      const requestArgs = args();
      requestArgs.ir = decodeExtractionRequest(ExtractionsSchema.parse({ ...request, input: "", reference_date: "2026-10-19", images: [{ content_type: "image/png", base64: "AQID" }] }));
      expect((await execute(requestArgs)).upstream.status).toBe(200);
      expect(mock.calls[0].bodyJson).toMatchObject({ state: "", reference_date: "2026-10-19", images: [{ content_type: "image/png", base64: "AQID" }] });
    } finally { mock.restore(); }
  });
  it("maps source and fields, unwraps Cloudflare and bills aggregate input once", async () => {
    const mock = installFetchMock([{ match: url => url.endsWith("/ai/run/@cf/cloudflare/clairic"), response: jsonResponse({ success: true, result: payload() }) }]);
    try {
      const result = await execute(args());
      expect(mock.calls[0].bodyJson).toMatchObject({ model: "clairic", state: request.input, fields: request.fields });
      expect(result.bill.usage).toMatchObject({ input_tokens: 655, output_tokens: 0, total_tokens: 655 });
      expect(result.kind).toBe("completed");
      if (result.kind !== "completed") throw new Error("Expected completed");
      const response = encodeExtractionResponse(result.ir as import("@core/ir").IRExtractionResponse);
      expect(response.answers.po).toEqual({ type: "text", value: null, confidence: 0.9, p_null: 0.99 });
      expect(response.usage.total_tokens).toBe(655);
    } finally { mock.restore(); }
  });
  it.each(["missing", "wrong-type", "bad-probability", "bad-usage", "failure-envelope"])("rejects %s provider success safely", async failure => {
    const body: any = payload();
    if (failure === "missing") delete body.answers.po;
    if (failure === "wrong-type") body.answers.total.value = "1080";
    if (failure === "bad-probability") body.answers.po.p_null = 2;
    if (failure === "bad-usage") body.usage.input_tokens = -1;
    const mock = installFetchMock([{ match: () => true, response: jsonResponse(failure === "failure-envelope" ? { success: false, result: body, errors: [{ message: "private provider diagnostic" }] } : body) }]);
    try {
      const result = await execute(args());
      expect(result.upstream.status).toBe(502);
      expect(await result.upstream.text()).not.toContain("private provider diagnostic");
      if (failure === "wrong-type") expect(result.bill.usage?.input_tokens).toBe(655);
    } finally { mock.restore(); }
  });
  it("rejects unsupported models before fetching", async () => {
    const mock = installFetchMock([]);
    try { expect((await execute({ ...args(), providerModelSlug: "@cf/cloudflare/clef" })).upstream.status).toBe(400); expect(mock.calls).toHaveLength(0); }
    finally { mock.restore(); }
  });
  it("rejects forecasts, invalid dates, remote images and empty input", () => {
    expect(ExtractionsSchema.safeParse({ ...request, fields: { x: { type: "forecast" } } }).success).toBe(false);
    expect(ExtractionsSchema.safeParse({ ...request, reference_date: "2026-02-30" }).success).toBe(false);
    expect(ExtractionsSchema.safeParse({ ...request, images: ["https://example.com/image.png"] }).success).toBe(false);
    expect(ExtractionsSchema.safeParse({ ...request, input: "" }).success).toBe(false);
  });
});
