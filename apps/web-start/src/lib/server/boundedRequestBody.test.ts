import { readBoundedTextBody } from "@/lib/server/boundedRequestBody";

describe("readBoundedTextBody", () => {
	it("rejects a declared oversized body without reading it", async () => {
		const cancel = jest.fn();
		const body = new ReadableStream<Uint8Array>({ cancel });
		const request = new Request("https://phaseo.app/webhook", {
			method: "POST",
			body,
			headers: { "content-length": "1025" },
			duplex: "half",
		} as RequestInit & { duplex: "half" });

		await expect(readBoundedTextBody(request, 1024)).resolves.toEqual({
			ok: false,
			reason: "body_too_large",
		});
		expect(cancel).not.toHaveBeenCalled();
	});

	it("cancels a lengthless stream as soon as it exceeds the limit", async () => {
		const cancel = jest.fn();
		let index = 0;
		const chunks = [new TextEncoder().encode("valid"), new Uint8Array(1024)];
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				const chunk = chunks[index++];
				if (chunk) controller.enqueue(chunk);
				else controller.close();
			},
			cancel,
		}, { highWaterMark: 0 });
		const request = new Request("https://phaseo.app/webhook", {
			method: "POST",
			body,
			duplex: "half",
		} as RequestInit & { duplex: "half" });

		await expect(readBoundedTextBody(request, 1024)).resolves.toEqual({
			ok: false,
			reason: "body_too_large",
		});
		expect(cancel).toHaveBeenCalledWith("request_body_too_large");
	});

	it("preserves a legitimate raw body exactly", async () => {
		const request = new Request("https://phaseo.app/webhook", {
			method: "POST",
			body: "{\"type\":\"checkout.session.completed\"}",
		});

		await expect(readBoundedTextBody(request, 1024)).resolves.toEqual({
			ok: true,
			text: "{\"type\":\"checkout.session.completed\"}",
		});
	});
});
