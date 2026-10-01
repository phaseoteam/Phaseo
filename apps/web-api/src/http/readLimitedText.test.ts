import { describe, expect, it } from "vitest";
import { readLimitedText } from "./readLimitedText";

function streamed(chunks: number[][]): Request {
	return { body: new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk)); controller.close(); } }) } as Request;
}
describe("bounded webhook bodies", () => {
	it("rejects an oversized stream without Content-Length", async () => {
		await expect(readLimitedText(streamed([[65, 66], [67]]), 2)).rejects.toThrow("payload_too_large");
	});
	it("counts bytes, preserving split UTF-8 characters", async () => {
		await expect(readLimitedText(streamed([[0xe2], [0x82, 0xac]]), 3)).resolves.toBe("€");
		await expect(readLimitedText(streamed([[0xe2], [0x82, 0xac]]), 2)).rejects.toThrow("payload_too_large");
	});
});
