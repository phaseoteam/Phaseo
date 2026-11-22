import { describe, expect, it } from "vitest";
import { createHtmlRenderer } from "@pierre/words/html";
import { chipMarkdown } from "@phaseo/app-kit/message-chips-markdown";
import { pullRequestProseLinks } from "./remarkPullRequestLinks";
import { pullRequestComponents } from "./WordsMessageContent";

const sha = "0123456789abcdef0123456789abcdef01234567";
const video = "https://github.com/user-attachments/assets/0f3c8a1e-1234-4abc-9def-0123456789ab";
const prepare = (text: string) => chipMarkdown(text, pullRequestProseLinks("o/r"));
const render = (text: string) => createHtmlRenderer({ components: pullRequestComponents }).render(prepare(text), false).html;

describe("pull request links drawn by Words", () => {
	it("links #123 and commit SHAs into the repository, as the remark plugin does", () => {
		expect(prepare(`Fixes #12 in ${sha}.`)).toBe(`Fixes [#12](https://github.com/o/r/issues/12) in [0123456](https://github.com/o/r/commit/${sha}).`);
		expect(prepare("a#12 #0 #12b")).toBe("a#12 #0 #12b");
	});

	it("leaves code, fences and existing links alone, and still makes chips", () => {
		expect(prepare("`#5` [#6](https://x) ```#7```")).toBe("`#5` [#6](https://x) ```#7```");
		expect(prepare("```\n#8\n```")).toBe("```\n#8\n```");
		expect(prepare("Edit apps/web/src/index.ts for #9")).toMatch(/^Edit \[index\.ts\]\(phaseo-chip:file:.*\) for \[#9\]\(https:\/\/github\.com\/o\/r\/issues\/9\)$/);
	});

	it("plays a GitHub video upload on a line of its own, and links one inside a sentence", () => {
		expect(render(video)).toContain(`data-portal="video" data-src="${video}"`);
		expect(render(`[demo](${video})`)).toContain('data-portal="video"');
		const inline = render(`Watch ${video} now`);
		expect(inline).not.toContain('data-portal="video"');
		expect(inline).toContain(`data-portal="link" data-href="${video}"`);
	});

	it("draws #123 as a link placeholder", () => {
		expect(render("See #4")).toContain('data-portal="link" data-href="https://github.com/o/r/issues/4" data-label="#4"');
	});
});
