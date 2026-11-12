import { describe, expect, it } from "vitest";
import { Phaseo } from "../src/index";

describe("extractions", () => {
  it("posts the typed schema and preserves null and uncertainty", async () => {
    const client = new Phaseo({ apiKey: "test", fetchImpl: async (input, init) => {
      expect(String(input)).toContain("/extractions");
      expect(JSON.parse(String(init?.body))).toMatchObject({ fields: { po: { type: "text" } } });
      return Response.json({ model: "cloudflare/clairic", answers: { po: { type: "text", value: null, p_null: 0.99, confidence: 0.98 } }, truncated: false,
        usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 } });
    } });
    const result = await client.extractions.create({ model: "cloudflare/clairic", input: "No purchase order", fields: { po: { type: "text" } } });
    expect(result.answers.po.value).toBeNull();
    expect(result.answers.po).toMatchObject({ p_null: 0.99 });
  });
});
