import { describe, expect, test, vi } from "vitest";
import { AIStats } from "../src/index.js";

describe("AIStats chat helpers", () => {
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

    const client = new AIStats({
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
});
