import { z } from "zod";

const instructions = z.string().max(2048).optional();
const precision = { integer: z.boolean().optional(), decimals: z.number().int().min(0).max(6).optional() };
const units = z.enum(["seconds", "minutes", "hours", "days", "weeks", "months", "years"]);
export const ExtractionFieldSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), instructions }).strict(),
  z.object({ type: z.literal("number"), instructions, ...precision, unit: z.string().max(64).optional() }).strict(),
  z.object({ type: z.literal("date"), instructions }).strict(),
  z.object({ type: z.literal("time"), instructions }).strict(),
  z.object({ type: z.literal("datetime"), instructions }).strict(),
  z.object({ type: z.literal("duration"), instructions, ...precision, unit: units.optional() }).strict(),
  z.object({ type: z.literal("list"), instructions, items: z.enum(["text", "number", "date"]), decimals: z.number().int().min(0).max(6).optional() }).strict(),
]);
export const ExtractionImageSchema = z.object({
  content_type: z.enum(["image/png", "image/jpeg", "image/webp"]),
  base64: z.string().max(4 * Math.ceil(4 * 1024 * 1024 / 3)).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict();
export const ExtractionsSchema = z.object({
  model: z.string().min(1).max(256),
  input: z.string().max(32768).refine(value => Array.from(value).length <= 16384, "Source text exceeds 16,384 characters."),
  fields: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/), ExtractionFieldSchema)
    .refine(fields => Object.keys(fields).length >= 1 && Object.keys(fields).length <= 64, "Supply 1–64 fields."),
  images: z.array(ExtractionImageSchema).max(4).optional(),
  reference_date: z.iso.date().optional(),
}).strict().superRefine((body, ctx) => {
  if (!body.input.trim() && !body.images?.length) ctx.addIssue({ code: "custom", path: ["input"], message: "Supply text or images." });
  let bytes = 0;
  for (const image of body.images ?? []) {
    const size = image.base64.length * 3 / 4 - (image.base64.endsWith("==") ? 2 : image.base64.endsWith("=") ? 1 : 0);
    bytes += size;
    if (!size || size > 4 * 1024 * 1024) ctx.addIssue({ code: "custom", path: ["images"], message: "Images must contain 1 byte–4 MiB of decoded data." });
  }
  if (bytes > 8 * 1024 * 1024) ctx.addIssue({ code: "custom", path: ["images"], message: "Images exceed 8 MiB decoded." });
});
export type ExtractionRequest = z.infer<typeof ExtractionsSchema>;
export type ExtractionField = z.infer<typeof ExtractionFieldSchema>;
const probability = z.number().finite().min(0).max(1);
const scalar = { confidence: probability, p_null: probability };
export const ExtractionAnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), value: z.string().nullable(), ...scalar }).strip(),
  z.object({ type: z.literal("number"), value: z.number().finite().nullable(), ...scalar }).strip(),
  z.object({ type: z.literal("duration"), value: z.number().finite().nullable(), ...scalar }).strip(),
  z.object({ type: z.literal("date"), value: z.iso.date().nullable(), ...scalar }).strip(),
  z.object({ type: z.literal("time"), value: z.iso.time().nullable(), ...scalar }).strip(),
  z.object({ type: z.literal("datetime"), value: z.iso.datetime({ offset: true, local: true }).nullable(), ...scalar }).strip(),
  z.object({ type: z.literal("list"), value: z.array(z.union([z.string(), z.number().finite()])).max(4096), confidence: probability }).strip(),
]);
export type ExtractionAnswer = z.infer<typeof ExtractionAnswerSchema>;

// Provider spans/guesses are intentionally omitted until their Unicode and truncation semantics are pinned.
export function validateExtractionAnswers(fields: Record<string, ExtractionField>, raw: unknown): Record<string, ExtractionAnswer> {
  const answers = z.record(z.string(), ExtractionAnswerSchema).parse(raw);
  if (Object.keys(answers).length !== Object.keys(fields).length) throw new Error("Extraction field count mismatch");
  for (const [name, field] of Object.entries(fields)) {
    const answer = Object.hasOwn(answers, name) ? answers[name] : undefined;
    if (!answer || answer.type !== field.type) throw new Error("Extraction field type mismatch");
    if ((field.type === "number" || field.type === "duration") && typeof answer.value === "number") {
      if (field.integer && !Number.isInteger(answer.value)) throw new Error("Expected integer extraction");
      if (field.decimals !== undefined && Math.abs(answer.value * 10 ** field.decimals - Math.round(answer.value * 10 ** field.decimals)) > 1e-6) throw new Error("Invalid extraction precision");
    }
    if (field.type === "list" && answer.type === "list") {
      const item = field.items === "number" ? z.number().finite() : field.items === "date" ? z.iso.date() : z.string();
      z.array(item).parse(answer.value);
      const decimals = field.decimals;
      if (field.items === "number" && decimals !== undefined && answer.value.some(value =>
        typeof value === "number" && Math.abs(value * 10 ** decimals - Math.round(value * 10 ** decimals)) > 1e-6,
      )) throw new Error("Invalid list precision");
    }
  }
  return answers;
}
