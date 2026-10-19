import { z } from "zod";
import { ExtractionsSchema, validateExtractionAnswers } from "@core/extraction";
import type { IRExtractionRequest, IRExtractionResponse } from "@core/ir";
import type { Bill, ProviderExecutor } from "@executors/types";
import { readStreamTextWithLimit } from "@core/bounded-stream";
import { runCloudflareModel, unwrapCloudflareResult } from "../shared";

const tokenCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const payloadSchema = z.object({
  model: z.enum(["clairic", "@cf/cloudflare/clairic"]),
  answers: z.unknown(), truncated: z.boolean(),
  usage: z.object({ input_tokens: tokenCount, output_tokens: z.literal(0),
    state_tokens: tokenCount.optional(), image_tokens: tokenCount.optional(), schema_tokens: tokenCount.optional(), passes: tokenCount.optional() }),
});

export const executor: ProviderExecutor = async args => {
  const ir = args.ir as IRExtractionRequest;
  const images = ir.images?.map(image => ({ content_type: image.contentType, base64: image.base64 }));
  const checked = ExtractionsSchema.safeParse({ model: ir.model, input: ir.sourceText, fields: ir.fields, images, reference_date: ir.referenceDate });
  if (!checked.success || args.providerModelSlug !== "@cf/cloudflare/clairic") {
    return { kind: "completed", terminal: true, localClientError: true,
      upstream: Response.json({ error: "unsupported_extraction_request", message: "Select Clairic and supply a valid extraction request." }, { status: 400 }),
      bill: { cost_cents: 0, currency: "USD" } };
  }
  const body = JSON.stringify({ model: "clairic", state: ir.sourceText, fields: ir.fields,
    ...(images?.length ? { images } : {}),
    ...(ir.referenceDate ? { reference_date: ir.referenceDate } : {}),
  });
  const { response, keySource, byokKeyId } = await runCloudflareModel(args, body, "application/json");
  const bill: Bill = { cost_cents: 0, currency: "USD", upstream_id: response.headers.get("cf-ray") };
  const common = { kind: "completed" as const, keySource, byokKeyId, bill,
    ...(args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest ? { mappedRequest: body } : {}) };
  if (!response.ok) return { ...common, upstream: response };
  let payload: unknown;
  try {
    const rawBody = await readStreamTextWithLimit(response.body, 2 * 1024 * 1024, "extraction_response_too_large");
    const envelope = JSON.parse(rawBody);
    if (envelope?.success === false) throw new Error("Cloudflare extraction failed");
    payload = unwrapCloudflareResult(envelope);
    const parsed = payloadSchema.parse(payload);
    const usage = { input_tokens: parsed.usage.input_tokens, output_tokens: 0, total_tokens: parsed.usage.input_tokens, requests: 1 };
    // Preserve billed aggregate usage even when semantic answer validation fails.
    common.bill = { ...bill, usage };
    const answers = validateExtractionAnswers(ir.fields, parsed.answers);
    const result: IRExtractionResponse = { model: ir.model, answers, truncated: parsed.truncated,
      usage: { inputTokens: usage.input_tokens, outputTokens: 0, totalTokens: usage.total_tokens } };
    return { ...common, upstream: new Response(rawBody, { status: response.status, headers: response.headers }), ir: result, rawResponse: payload };
  } catch {
    return { ...common, terminal: true,
      upstream: Response.json({ error: "invalid_extraction_response", message: "The provider returned an invalid extraction response.", request_id: args.requestId }, { status: 502 }),
      rawResponse: payload };
  }
};
