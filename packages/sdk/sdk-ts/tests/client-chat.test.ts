import { describe, expect, test, vi } from "vitest";
import { Phaseo } from "../src/index.js";

describe("Phaseo chat helpers", () => {
  test("preserves gateway chat metadata through generateText", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/chat/completions");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          id: "req_123",
          nativeResponseId: "chatcmpl_123",
          object: "chat.completion",
          created: 1_723_000_000,
          model: "openai/gpt-5-nano",
          provider: "openai",
          session_id: "session_ts_chat_1",
          upstream_request_id: "upstream_ts_chat_1",
          provider_attempts: [{ provider: "openai", status_code: 200, duration_ms: 412 }],
          pricing_lines: [{ provider: "openai", cost_usd: 0.0025 }],
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "hi" },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.generateText({
      model: "openai/gpt-5-nano",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(response.provider).toBe("openai");
    expect(response.nativeResponseId).toBe("chatcmpl_123");
    expect((response as any).session_id).toBe("session_ts_chat_1");
    expect((response as any).upstream_request_id).toBe("upstream_ts_chat_1");
    expect((response as any).provider_attempts).toEqual([{ provider: "openai", status_code: 200, duration_ms: 412 }]);
    expect((response as any).pricing_lines).toEqual([{ provider: "openai", cost_usd: 0.0025 }]);
    expect(response.choices?.[0]?.message?.content).toBe("hi");
  });

  test("parses chat stream chunks with text and usage", async () => {
    const encoder = new TextEncoder();
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/chat/completions");
      expect(init?.method).toBe("POST");

      const body = JSON.parse(String(init?.body));
      expect(body.stream).toBe(true);

      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(
              'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n',
            ));
            controller.enqueue(encoder.encode(
              'data: {"choices":[{"delta":{"content":"lo"}}],"usage":{"completion_tokens_details":{"reasoning_tokens":7}}}\n\n',
            ));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        },
      );
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    let text = "";
    let reasoningTokens: number | null | undefined = null;

    for await (const chunk of client.streamChat({
      model: "openai/gpt-5-nano",
      messages: [{ role: "user", content: "hi" }],
    })) {
      text += chunk.text;
      if (chunk.reasoningTokens !== null) {
        reasoningTokens = chunk.reasoningTokens;
      }
    }

    expect(text).toBe("hello");
    expect(reasoningTokens).toBe(7);
  });

  test("parses response stream chunks with text and usage", async () => {
    const encoder = new TextEncoder();
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/responses");
      expect(init?.method).toBe("POST");

      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(
              'data: {"type":"response.output_text.delta","delta":"hel"}\n\n',
            ));
            controller.enqueue(encoder.encode(
              'data: {"type":"response.completed","response":{"usage":{"output_tokens_details":{"reasoning_tokens":9}}}}\n\n',
            ));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        },
      );
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    let text = "";
    let reasoningTokens: number | null | undefined = null;

    for await (const chunk of client.streamResponses({
      model: "openai/gpt-5-nano",
      input: "hi",
    })) {
      text += chunk.text;
      if (chunk.reasoningTokens !== null) {
        reasoningTokens = chunk.reasoningTokens;
      }
    }

    expect(text).toBe("hel");
    expect(reasoningTokens).toBe(9);
  });

  test("parses message stream chunks with text and usage", async () => {
    const encoder = new TextEncoder();
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/messages");
      expect(init?.method).toBe("POST");

      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(
              'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}\n\n',
            ));
            controller.enqueue(encoder.encode(
              'data: {"type":"message_delta","message":{"usage":{"reasoning_tokens":3}}}\n\n',
            ));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        },
      );
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    let text = "";
    let reasoningTokens: number | null | undefined = null;

    for await (const chunk of client.streamMessages({
      model: "anthropic/claude-sonnet-4.5",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 16,
    } as any)) {
      text += chunk.text;
      if (chunk.reasoningTokens !== null) {
        reasoningTokens = chunk.reasoningTokens;
      }
    }

    expect(text).toBe("hi");
    expect(reasoningTokens).toBe(3);
  });
});
