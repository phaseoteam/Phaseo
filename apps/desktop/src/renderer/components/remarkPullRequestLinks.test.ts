import { describe, expect, it } from "vitest";
import { autolinkText, isGitHubVideoUpload, remarkPullRequestLinks } from "./remarkPullRequestLinks";

const repo = "https://github.com/o/r", sha = "0123456789abcdef0123456789abcdef01234567";
describe("pull request markdown links", () => {
	it("links #123 and full commit SHAs at word boundaries only", () => {
		expect(autolinkText(`Fixes #12 in ${sha}.`, repo)).toEqual([{ type: "text", value: "Fixes " }, { type: "link", url: `${repo}/issues/12`, children: [{ type: "text", value: "#12" }] }, { type: "text", value: " in " }, { type: "link", url: `${repo}/commit/${sha}`, children: [{ type: "text", value: "0123456" }] }, { type: "text", value: "." }]);
		expect(autolinkText("a#12 #0 #12b x" + sha, repo)).toEqual([{ type: "text", value: "a#12 #0 #12b x" + sha }]);
		expect(autolinkText(`(${sha})`, repo)[1]).toMatchObject({ type: "link" });
	});
	it("recognises GitHub video uploads", () => {
		expect(isGitHubVideoUpload("https://github.com/user-attachments/assets/0f3c8a1e-1234-4abc-9def-0123456789ab")).toBe(true);
		expect(isGitHubVideoUpload("https://github.com/o/r/assets/12/0f3c8a1e-1234-4abc-9def-0123456789ab")).toBe(true);
		expect(isGitHubVideoUpload("https://example.com/user-attachments/assets/0f3c8a1e-1234-4abc-9def-0123456789ab")).toBe(false);
	});
	it("leaves code and existing links alone and plays a lone video line", () => {
		const tree = { type: "root", children: [
			{ type: "paragraph", children: [{ type: "text", value: "See #4 " }, { type: "inlineCode", value: "#5" }, { type: "link", url: "https://x", children: [{ type: "text", value: "#6" }] }] },
			{ type: "paragraph", children: [{ type: "text", value: "https://github.com/user-attachments/assets/0f3c8a1e-1234-4abc-9def-0123456789ab" }] },
		] };
		remarkPullRequestLinks({ repository: "o/r" })()(tree);
		const [first, second] = tree.children as { type: string; children?: { type: string; value?: string; url?: string }[]; data?: { hName?: string } }[];
		expect(first.children!.map(child => child.type)).toEqual(["text", "link", "text", "inlineCode", "link"]);
		expect(first.children![3].value).toBe("#5");
		expect(second).toMatchObject({ type: "pullRequestVideo", data: { hName: "video" } });
	});
});
