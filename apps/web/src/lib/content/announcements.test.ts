import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAnnouncementPost, getAnnouncementPosts } from "./announcements";

describe("announcement SEO frontmatter", () => {
	it("reads the SEO title, keywords and FAQ a post declares", async () => {
		const post = await getAnnouncementPost("llm-rate-limits-and-ai-budgets", {
			includeFuture: true,
		});

		expect(post?.seoTitle).toBe(
			"LLM Rate Limiting and AI Budgets per User, Team and API Key"
		);
		expect(post?.keywords).toContain("LLM rate limiting");
		expect(post?.faq.length).toBeGreaterThan(0);
		for (const item of post?.faq ?? []) {
			expect(item.question.trim()).not.toBe("");
			expect(item.answer.trim()).not.toBe("");
		}
	});

	it("leaves the fields empty for posts that don't declare them", async () => {
		const post = await getAnnouncementPost("icymi-september-2026-what-we-shipped");

		expect(post?.seoTitle).toBeNull();
		expect(post?.keywords).toEqual([]);
		expect(post?.faq).toEqual([]);
	});

	it("keeps post-only fields out of list summaries", async () => {
		const [summary] = await getAnnouncementPosts({ includeFuture: true });

		expect(summary).not.toHaveProperty("faq");
		expect(summary).not.toHaveProperty("seoTitle");
	});
});

describe("announcement cover images", () => {
	it("only points at cover images that exist", async () => {
		const posts = await getAnnouncementPosts({ includeFuture: true });

		for (const { slug, coverImage } of posts) {
			if (!coverImage) continue;
			expect({ slug, exists: existsSync(join(process.cwd(), "public", coverImage)) }).toEqual({
				slug,
				exists: true,
			});
		}
	});
});
