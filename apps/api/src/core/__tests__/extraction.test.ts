import { describe, expect, it } from "vitest";
import { ExtractionsSchema, validateExtractionAnswers, type ExtractionField } from "../extraction";

const scalar = (type: string, value: unknown) => ({ type, value, confidence: 0.9, p_null: 0.1 });
describe("typed extraction validation", () => {
  it.each([
    [{ type: "date" }, "2026-02-30"],
    [{ type: "time" }, "25:00:00"],
    [{ type: "datetime" }, "not a date"],
    [{ type: "number", integer: true }, 1.5],
    [{ type: "number", decimals: 2 }, 1.234],
    [{ type: "duration", integer: true }, 0.5],
  ])("rejects invalid typed values: %j", (field, value) => {
    expect(() => validateExtractionAnswers({ x: field as ExtractionField }, { x: scalar(field.type, value) })).toThrow();
  });
  it("preserves null, zero and empty lists as distinct values", () => {
    const answers = validateExtractionAnswers({ missing: { type: "date" }, zero: { type: "number" }, empty: { type: "list", items: "text" } }, {
      missing: scalar("date", null), zero: scalar("number", 0), empty: { type: "list", value: [], confidence: 1 },
    });
    expect(answers.missing.value).toBeNull(); expect(answers.zero.value).toBe(0); expect(answers.empty.value).toEqual([]);
  });
  it("validates list item types and precision", () => {
    expect(() => validateExtractionAnswers({ x: { type: "list", items: "date" } }, { x: { type: "list", value: ["2026-02-30"], confidence: 1 } })).toThrow();
    expect(() => validateExtractionAnswers({ x: { type: "list", items: "number", decimals: 2 } }, { x: { type: "list", value: [1.234], confidence: 1 } })).toThrow();
  });
  it("rejects missing, extra and mismatched answers", () => {
    expect(() => validateExtractionAnswers({ x: { type: "text" } }, {})).toThrow();
    expect(() => validateExtractionAnswers({ x: { type: "text" } }, { x: scalar("number", 0) })).toThrow();
    expect(() => validateExtractionAnswers({ x: { type: "text" } }, { x: scalar("text", "a"), y: scalar("text", "b") })).toThrow();
  });
  it("allows image-only input while enforcing source and field limits", () => {
    const request = { model: "cloudflare/clairic", input: "", fields: { x: { type: "text" } }, images: [{ content_type: "image/png", base64: "AQID" }] };
    expect(ExtractionsSchema.safeParse(request).success).toBe(true);
    expect(ExtractionsSchema.safeParse({ ...request, input: "😀".repeat(16384) }).success).toBe(true);
    expect(ExtractionsSchema.safeParse({ ...request, input: "x".repeat(16385) }).success).toBe(false);
    expect(ExtractionsSchema.safeParse({ ...request, fields: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`field_${i}`, { type: "text" }])) }).success).toBe(false);
    expect(ExtractionsSchema.safeParse({ ...request, images: Array(5).fill(request.images[0]) }).success).toBe(false);
  });
});
