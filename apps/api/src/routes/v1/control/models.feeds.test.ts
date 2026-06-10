import { describe, expect, it } from "vitest";
import { buildFeedResponse, parseFeedFormat } from "./models.feeds";

describe("parseFeedFormat", () => {
    it("defaults to json", () => {
        const url = new URL("https://api.example.com/v1/models?limit=10");
        expect(parseFeedFormat(url)).toEqual({ ok: true, format: "json" });
    });

    it("accepts format and feed alias", () => {
        const formatUrl = new URL("https://api.example.com/v1/models?format=rss");
        const aliasUrl = new URL("https://api.example.com/v1/models?feed=atom");
        expect(parseFeedFormat(formatUrl)).toEqual({ ok: true, format: "rss" });
        expect(parseFeedFormat(aliasUrl)).toEqual({ ok: true, format: "atom" });
    });

    it("rejects unknown formats", () => {
        const url = new URL("https://api.example.com/v1/models?format=xml");
        expect(parseFeedFormat(url)).toEqual({ ok: false, raw: "xml" });
    });
});

describe("buildFeedResponse", () => {
    it("renders rss xml with escaped values", async () => {
        const response = buildFeedResponse({
            url: new URL("https://api.example.com/v1/models?format=rss&limit=2"),
            format: "rss",
            title: "Gateway Models",
            description: "Gateway <catalogue>",
            items: [
                {
                    id: "openai/gpt-5",
                    title: "OpenAI & GPT-5",
                    summary: "Supports <chat> and \"responses\"",
                    updatedAt: "2026-02-01T12:30:00.000Z",
                },
            ],
            headers: {
                "Cache-Control": "private, max-age=60",
            },
        });

        const body = await response.text();
        expect(response.headers.get("content-type")).toContain("application/rss+xml");
        expect(response.headers.get("cache-control")).toBe("private, max-age=60");
        expect(body).toContain("<rss version=\"2.0\">");
        expect(body).toContain("<title>OpenAI &amp; GPT-5</title>");
        expect(body).toContain("Supports &lt;chat&gt; and &quot;responses&quot;");
        expect(body).toContain("<link>https://api.example.com/v1/models?limit=2</link>");
    });

    it("renders atom xml", async () => {
        const response = buildFeedResponse({
            url: new URL("https://api.example.com/v1/models?feed=atom"),
            format: "atom",
            title: "Data Models",
            description: "Data source",
            items: [
                {
                    id: "model-1",
                    title: "Model 1",
                    summary: "summary",
                    updatedAt: "2026-01-15T00:00:00.000Z",
                },
            ],
        });

        const body = await response.text();
        expect(response.headers.get("content-type")).toContain("application/atom+xml");
        expect(body).toContain("<feed xmlns=\"http://www.w3.org/2005/Atom\">");
        expect(body).toContain("<entry>");
        expect(body).toContain("<id>model-1</id>");
        expect(body).toContain("<link rel=\"self\" href=\"https://api.example.com/v1/models\"/>");
    });
});
