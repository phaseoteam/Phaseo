import type { ExtractionRequest } from "@core/extraction";
import type { IRExtractionRequest, IRExtractionResponse } from "@core/ir";

export function decodeExtractionRequest(body: ExtractionRequest): IRExtractionRequest {
  return { model: body.model, sourceText: body.input, fields: body.fields,
    images: body.images?.map(image => ({ contentType: image.content_type, base64: image.base64 })),
    referenceDate: body.reference_date };
}
export function encodeExtractionResponse(ir: IRExtractionResponse) {
  return { model: ir.model, answers: ir.answers, truncated: ir.truncated,
    usage: { input_tokens: ir.usage.inputTokens, output_tokens: ir.usage.outputTokens, total_tokens: ir.usage.totalTokens },
  };
}
