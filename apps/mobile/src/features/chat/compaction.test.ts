import { COMPACT_AT, contextTokensFrom, estimatePrompt, estimateTokens, FALLBACK_CONTEXT_TOKENS, fitStart, MEDIA_TOKENS, shouldCompact, summaryMessages, summaryRequest, tailStart, transcriptText } from "./compaction";

const user = (content: string) => ({ role: "user" as const, content });
const assistant = (content: string) => ({ role: "assistant" as const, content });

/** `turns` question/answer pairs of the given sizes, then the new question. */
const thread = (turns: number, answerChars = 3_500) => [...Array.from({ length: turns }, (_, index) => [user(`question ${index}`), assistant("a".repeat(answerChars))]).flat(), user("the new question")];

describe("budgeting", () => {
  test("the window is the smallest provider's, or 128k when the catalogue has none", () => {
    expect(contextTokensFrom([131_072, 1_048_576, 262_144])).toBe(131_072);
    expect(contextTokensFrom([])).toBe(FALLBACK_CONTEXT_TOKENS);
    expect(contextTokensFrom([0, null, undefined])).toBe(FALLBACK_CONTEXT_TOKENS);
  });

  test("a request is estimated at 3.5 characters a token, plus an allowance per image", () => {
    expect(estimateTokens(3_500)).toBe(1_000);
    expect(estimatePrompt({ threadChars: 35_000, systemChars: 350, summaryChars: 3_150, media: 0 })).toBe(11_000);
    expect(estimatePrompt({ threadChars: 35_000, systemChars: 0, summaryChars: 0, media: 2 })).toBe(10_000 + 2 * MEDIA_TOKENS);
  });

  test("the gateway's count of the previous request replaces the estimate of everything before it", () => {
    expect(estimatePrompt({ threadChars: 999_999, systemChars: 0, summaryChars: 0, media: 0, calibrated: { promptTokens: 50_000, charsSince: 7_000 } })).toBe(52_000);
    // A zero count (a provider that didn't report usage) falls back to the estimate.
    expect(estimatePrompt({ threadChars: 7_000, systemChars: 0, summaryChars: 0, media: 0, calibrated: { promptTokens: 0, charsSince: 7_000 } })).toBe(2_000);
  });

  test("compaction starts past 80% of the window", () => {
    expect(COMPACT_AT).toBe(0.8);
    expect(shouldCompact(80_000, 100_000)).toBe(false);
    expect(shouldCompact(80_001, 100_000)).toBe(true);
  });
});

describe("what is summarised and what is kept", () => {
  test("about a quarter of the window is kept word for word, from a question", () => {
    // 100 turns of 1,000-token answers in a 40k window: the tail is under 10k tokens.
    const messages = thread(100);
    const tail = tailStart(messages, 40_000);
    expect(messages[tail]!.role).toBe("user");
    const kept = messages.slice(tail).reduce((sum, message) => sum + estimateTokens(message.content.length), 0);
    expect(kept).toBeLessThan(10_000);
    expect(kept).toBeGreaterThan(7_000);
  });

  test("the new question is always kept, even when it alone is over the tail's share", () => {
    const messages = [...thread(3), user("x".repeat(200_000))];
    expect(tailStart(messages, 40_000)).toBe(messages.length - 1);
  });

  test("there's nothing to summarise in a chat of one question", () => {
    expect(tailStart([user("x".repeat(500_000))], 40_000)).toBe(-1);
  });

  test("without a summary, the newest messages that fit are sent, from a question", () => {
    const messages = thread(50);
    const start = fitStart(messages, 10_000);
    expect(messages[start]!.role).toBe("user");
    expect(messages.slice(start).reduce((sum, message) => sum + estimateTokens(message.content.length), 0)).toBeLessThanOrEqual(10_000);
    expect(fitStart(messages, 1)).toBe(messages.length - 1);
  });
});

describe("the summary request", () => {
  test("leaves out the oldest messages first and keeps the previous summary", () => {
    const text = transcriptText(thread(20, 1_000), 5_000, "The earlier summary.", 7);
    expect(text.startsWith("Summary of the conversation before this point:\nThe earlier summary.")).toBe(true);
    expect(text).toMatch(/\[\d+ earlier messages left out\]/);
    expect(Number(/\[(\d+) earlier/.exec(text)![1])).toBeGreaterThan(7);
    expect(text).toContain("User:\nthe new question");
    expect(text.length).toBeLessThan(5_000 + 200);
  });

  test("uses desktop's instructions, the transcript and the latest request, and ends asking for the summary", () => {
    const [system, request] = summaryRequest({ head: thread(2, 100).slice(0, -1), latestRequest: "the new question", contextTokens: 128_000 });
    expect(system!.role).toBe("system");
    expect(system!.content).toMatch(/compacting a conversation/);
    expect(request!.content).toContain("User:\nquestion 0");
    expect(request!.content).toContain("The person's latest request was:\nthe new question");
    expect(request!.content.endsWith("Write the summary now.")).toBe(true);
  });

  test("the summary replaces the older messages as a question and an acknowledgement", () => {
    const [summary, acknowledgement] = summaryMessages("Facts so far.");
    expect(summary).toEqual({ role: "user", content: expect.stringContaining("<conversation_summary>\nFacts so far.\n</conversation_summary>") });
    expect(acknowledgement!.role).toBe("assistant");
  });
});
