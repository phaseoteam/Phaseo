import { describe, expect, it } from "vitest";
import { COMPLETE_HEAD_HEADER } from "./completeHead";
import { wantsCompleteHead } from "./streamedMetadata";

const request = (headers: Record<string, string>) => new Request("https://phaseo.app/models", { headers });

describe("wantsCompleteHead", () => {
	it.each([
		"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
		"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot",
		"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
		"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
		"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
		"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
		"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-User/1.0; +https://docs.mistral.ai/robots)",
	])("blocks on metadata for %s", (userAgent) => {
		expect(wantsCompleteHead(request({ "user-agent": userAgent }))).toBe(true);
	});

	it("streams metadata to browsers", () => {
		expect(wantsCompleteHead(request({ "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0 Safari/537.36" }))).toBe(false);
		expect(wantsCompleteHead(undefined)).toBe(false);
	});

	it("blocks on metadata for the render behind a Markdown response", () => {
		expect(wantsCompleteHead(request({ "user-agent": "Mozilla/5.0 Chrome/142.0", [COMPLETE_HEAD_HEADER]: "1" }))).toBe(true);
	});
});
