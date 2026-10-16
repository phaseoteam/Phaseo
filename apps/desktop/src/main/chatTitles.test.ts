import { describe, expect, it, vi } from "vitest";
import { cleanTitle, generateTitle } from "./chatTitles";

describe("chat titles", () => {
	it("keeps a short clean first line", () => {
		expect(cleanTitle("\"Fix the usage undercount.\"\nExtra")).toBe("Fix the usage undercount");
		expect(cleanTitle("Title: **Desktop CI workflow**")).toBe("Desktop CI workflow");
		expect(cleanTitle("   \n  ")).toBeUndefined();
		expect(cleanTitle("x".repeat(200))).toHaveLength(80);
	});

	it("asks the title model through the Phaseo account and reads its reply", async () => {
		const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			const body = JSON.parse(init!.body as string);
			expect(body).toMatchObject({ model: "owned/small", stream: false, max_tokens: 24 });
			expect(body.messages[1].content).toContain("Why does usage drop");
			return new Response(JSON.stringify({ choices: [{ message: { content: "Usage drops after re-sign-in." } }] }));
		});
		expect(await generateTitle({ endpoint: "https://api.example/v1/", token: "owned", model: "owned/small", text: "Why does usage drop after I sign in again?", fetcher })).toBe("Usage drops after re-sign-in");
		expect(fetcher.mock.calls[0][0]).toBe("https://api.example/v1/chat/completions");
		await expect(generateTitle({ endpoint: "https://api.example/v1", token: "owned", model: "m", text: "Q", fetcher: async () => new Response("no", { status: 402 }) })).rejects.toThrow("402");
	});
});
