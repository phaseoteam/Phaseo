import { expect, it } from "vite-plus/test";
import { generatePhaseoText } from "../src/textGeneration.js";

it("uses the Phaseo SDK for product text without giving it runtime tools", async () => {
  const output = await generatePhaseoText({
    model: "lab/model",
    key: "fixture",
    prompt: "Generate a title",
    signal: new AbortController().signal,
    client: {
      generate: async (request) => {
        expect(request.model).toBe("lab/model");
        expect(request.tools).toEqual([]);
        return { message: { role: "assistant", content: '{"title":"Native harness"}' } };
      },
    },
  });
  expect(JSON.parse(output)).toEqual({ title: "Native harness" });
});
