import { getMigrationPost, getMigrationPosts, MIGRATION_POSTS } from "./migrations";

const translatedLocales = [
	"ar-SA",
	"de-DE",
	"es-ES",
	"fr-FR",
	"hi",
	"ja",
	"pt-BR",
	"zh-Hans",
] as const;

function visibleText(post: (typeof MIGRATION_POSTS)[number]): string[] {
	return [
		post.title,
		post.seoTitle,
		post.description,
		post.excerpt,
		...post.keywords,
		...post.prerequisites,
		...post.sections.flatMap((section) => [
			section.title,
			...section.paragraphs,
			...(section.checklist ?? []),
			...(section.codeSnippets?.map((snippet) => snippet.label) ?? []),
			...(section.screenshots?.flatMap((screenshot) => [screenshot.title, screenshot.description]) ?? []),
		]),
		...post.validationSteps.filter((step) => !step.trimStart().startsWith("curl ")),
		...post.faq.flatMap((item) => [item.question, item.answer]),
		...(post.references?.map((reference) => reference.label) ?? []),
	];
}

describe("OpenRouter migration content", () => {
	it("exposes a focused alternative page for search and answer agents", () => {
		const post = getMigrationPost("openrouter");

		expect(post).toBeDefined();
		expect(post?.title).toContain("OpenRouter Alternative");
		expect(post?.seoTitle.length).toBeLessThanOrEqual(60);
		expect(post?.description.length).toBeGreaterThanOrEqual(150);
		expect(post?.description.length).toBeLessThanOrEqual(160);
		expect(post?.keywords).toEqual(
			expect.arrayContaining([
				"OpenRouter alternative",
				"migrate from OpenRouter",
			]),
		);
		expect(post?.sections[0]?.paragraphs.join(" ")).toContain(
			"Stripe confirmed its acquisition of OpenRouter",
		);
		expect(post?.faq.length).toBeGreaterThanOrEqual(5);
		expect(post?.references).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ href: "/compare/openrouter" }),
			]),
		);
	});
});

describe.each(translatedLocales)("%s migration guide translations", (locale) => {
	it("translates every visible source string and preserves code and identifiers", () => {
		const localizedPosts = getMigrationPosts(locale);

		expect(localizedPosts).toHaveLength(MIGRATION_POSTS.length);

		for (const [index, source] of MIGRATION_POSTS.entries()) {
			const localized = localizedPosts[index]!;
			const sourceText = visibleText(source);
			const localizedText = visibleText(localized);

			expect(localizedText).toHaveLength(sourceText.length);
			for (const [textIndex, original] of sourceText.entries()) {
				expect(localizedText[textIndex]).not.toBe(original);
			}

			expect(localized.slug).toBe(source.slug);
			expect(localized.sourceLabel).toBe(source.sourceLabel);
			expect(localized.updatedAt).toBe(source.updatedAt);
			expect(localized.sections.map((section) => section.id)).toEqual(
				source.sections.map((section) => section.id),
			);
			expect(
				localized.sections.flatMap((section) =>
					section.codeSnippets?.map(({ code, lang }) => ({ code, lang })) ?? [],
				),
			).toEqual(
				source.sections.flatMap((section) =>
					section.codeSnippets?.map(({ code, lang }) => ({ code, lang })) ?? [],
				),
			);
			expect(localized.validationSteps.filter((step) => step.trimStart().startsWith("curl "))).toEqual(
				source.validationSteps.filter((step) => step.trimStart().startsWith("curl ")),
			);
		}
	});
});