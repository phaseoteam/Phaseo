import { readChatCompletion, StreamError } from "./stream";

function body(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

const packet = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;

describe("readChatCompletion", () => {
  it("joins text and reasoning deltas split across reads", async () => {
    const text: string[] = [];
    const thoughts: string[] = [];
    const full = packet({ choices: [{ delta: { reasoning: "Think" } }] }) + packet({ choices: [{ delta: { content: "Hel" } }] }) + packet({ choices: [{ delta: { content: "lo" }, finish_reason: "stop" }] }) + packet({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 2 } }) + "data: [DONE]\n\n";
    const result = await readChatCompletion(body([full.slice(0, 37), full.slice(37, 90), full.slice(90)]), { onText: (value) => text.push(value), onReasoning: (value) => thoughts.push(value) });
    expect(result.text).toBe("Hello");
    expect(result.reasoning).toBe("Think");
    expect(text.join("")).toBe("Hello");
    expect(thoughts).toEqual(["Think"]);
    expect(result.usage).toMatchObject({ prompt_tokens: 3, completion_tokens: 2 });
  });

  it("surfaces a provider error sent mid-stream", async () => {
    await expect(readChatCompletion(body([packet({ choices: [{ delta: { content: "Hi" } }] }), packet({ error: { message: "Upstream overloaded" } })]), { onText: () => undefined }))
      .rejects.toMatchObject({ message: "Upstream overloaded", code: "stream_error" });
  });

  it("reports an answer cut off by the output limit", async () => {
    await expect(readChatCompletion(body([packet({ choices: [{ delta: { content: "Partial" }, finish_reason: "length" }] })]), { onText: () => undefined }))
      .rejects.toBeInstanceOf(StreamError);
  });
});
