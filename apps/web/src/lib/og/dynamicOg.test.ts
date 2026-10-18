import { DYNAMIC_OG_LIMITS, parseDynamicOgParams } from "./dynamicOg";

function parse(query: string) {
	return parseDynamicOgParams(new URLSearchParams(query));
}

describe("parseDynamicOgParams", () => {
	it("accepts a title, description and pathname", () => {
		expect(
			parse(
				"title=Hello%20World&description=This%20is%20a%20dynamic%20OG%20image&pathname=/docs/quickstart",
			),
		).toEqual({
			ok: true,
			value: {
				title: "Hello World",
				description: "This is a dynamic OG image",
				pathname: "/docs/quickstart",
			},
		});
	});

	it("normalises whitespace and drops empty optional fields", () => {
		expect(parse("title=%20%20GPT-5.5%20%0A%20pricing%20&description=")).toEqual({
			ok: true,
			value: { title: "GPT-5.5 pricing" },
		});
	});

	it.each([
		"Next.js streaming with Phaseo",
		"Claude Opus 5.5 vs GPT-5.5: 40% cheaper",
		"Café résumé — naïve façade",
		"Read more at phaseo.app/docs",
		"Docs live at docs.phaseo.app.",
		"Ship it. Next, measure latency",
		"ASP.NET and Node.js SDKs, e.g. v2.1",
		"Class assessment for Scunthorpe",
		"Passing the cocktail analysis",
		"Shitake mushrooms in a bass guitar class",
		"A B testing: p value vs. t test",
		"Sussex, Essex and Middlesex",
		"Grape juice and dickens novels",
	])("allows ordinary text: %s", (title) => {
		expect(parse(new URLSearchParams({ title }).toString())).toMatchObject({ ok: true });
	});

	it("requires a title", () => {
		expect(parse("description=hi")).toEqual({
			ok: false,
			reason: "missing_title",
			field: "title",
		});
	});

	it("rejects unknown and repeated params so cache keys cannot be varied", () => {
		expect(parse("title=Hi&v=2")).toMatchObject({ ok: false, reason: "unknown_param", field: "v" });
		expect(parse("title=Hi&title=Again")).toMatchObject({ ok: false, reason: "duplicate_param" });
	});

	it("enforces length limits", () => {
		const title = "a".repeat(DYNAMIC_OG_LIMITS.title + 1);
		expect(parse(new URLSearchParams({ title }).toString())).toMatchObject({
			ok: false,
			reason: "too_long",
			field: "title",
		});
	});

	it.each([
		["markup", "<script>alert(1)</script>"],
		["zero-width", "Hel​lo"],
		["bidi override", "Hello ‮dlrow"],
		["non-Latin script", "Привет мир"],
		["emoji", "Hello 🚀"],
	])("rejects %s characters", (_label, title) => {
		expect(parse(new URLSearchParams({ title }).toString())).toMatchObject({
			ok: false,
			reason: "invalid_characters",
		});
	});

	it.each([
		"Claim free credits at https://example.com",
		"Visit www.example.org",
		"Free credits at evil.com",
		"Free credits at evil . xyz",
		"Email support@example.com",
		"Free credits at evil.cloud",
		"Free credits at evil.website",
		"Claim at support-phaseo.app",
		"Claim at phaseo.app.evil.com",
		"Claim at phaseo-support.phaseo.app",
	])("rejects links: %s", (description) => {
		expect(
			parse(new URLSearchParams({ title: "Phaseo", description }).toString()),
		).toMatchObject({ ok: false, reason: "contains_link", field: "description" });
	});

	it.each([
		["/docs/../../etc", false],
		["docs/quickstart", false],
		["//evil.com", false],
		["/models/openai/gpt-5.5", true],
		["/docs/v1/api-reference/introduction", true],
		["/claim-free-credits-at-evil.com", false],
		["/www.evil.xyz", false],
	])("validates pathname %s", (pathname, ok) => {
		expect(parse(new URLSearchParams({ title: "Phaseo", pathname }).toString()).ok).toBe(ok);
	});

	it.each([
		["plain", "This is shit"],
		["leetspeak", "fuuuck th1s"],
		["spaced out", "f u c k this"],
		["dotted", "f.u.c.k this"],
		["confusable", "ƒuck this"],
		["slashed", "f/u/c/k this"],
		["plus-separated", "f+u+c+k this"],
		["colon-separated", "f:u:c:k this"],
	])("blocks profanity (%s)", (_label, title) => {
		expect(parse(new URLSearchParams({ title }).toString())).toMatchObject({
			ok: false,
			reason: "blocked_text",
		});
	});

	it("blocks profanity in the pathname", () => {
		expect(parse("title=Phaseo&pathname=/fuck-this")).toMatchObject({
			ok: false,
			reason: "blocked_text",
			field: "pathname",
		});
	});
});
