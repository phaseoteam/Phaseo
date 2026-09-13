import { describe, expect, test, vi } from "vitest";
import { Phaseo } from "../src/index.js";

function imageEventStream(...events: object[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("Phaseo image helpers", () => {
  test("streams image generation events", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      expect(String(input)).toBe("https://example.test/images/generations");
      expect(init?.headers).toMatchObject({ Accept: "text/event-stream" });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: "openai/gpt-image-2.5-flare",
        stream: true,
      });
      return imageEventStream(
        { type: "image_generation.partial_image", partial_image_index: 0, b64_json: "first" },
        { type: "image_generation.completed", usage: { total_tokens: 12 } },
      );
    }) as unknown as typeof fetch;
    const client = new Phaseo({ apiKey: "sk_test", baseUrl: "https://example.test", fetchImpl });

    const events = [];
    for await (const event of client.streamImage({
      model: "openai/gpt-image-2.5-flare",
      prompt: "A lighthouse",
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "image_generation.partial_image", b64_json: "first" });
  });

  test("serializes and streams multi-image edits", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      expect(String(input)).toBe("https://example.test/images/edits");
      expect(init?.headers).toMatchObject({ Accept: "text/event-stream" });
      const form = init?.body as FormData;
      expect(form.getAll("image")).toEqual(["first-image", "second-image"]);
      expect(form.get("stream")).toBe("true");
      return imageEventStream({ type: "image_generation.partial_image", b64_json: "edited" });
    }) as unknown as typeof fetch;
    const client = new Phaseo({ apiKey: "sk_test", baseUrl: "https://example.test", fetchImpl });

    const events = [];
    for await (const event of client.streamImageEdit({
      model: "openai/gpt-image-2.5-sunburst",
      image: ["first-image", "second-image"],
      prompt: "Combine the references",
    })) {
      events.push(event);
    }

    expect(events).toEqual([{ type: "image_generation.partial_image", b64_json: "edited" }]);
  });
});
