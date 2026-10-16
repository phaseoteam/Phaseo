import { describe, expect, it, vi } from "vitest";
import { DecisionsSchema } from "@core/schemas";
import { decodeDecisionsRequest } from "@protocols/decisions/decode";
import { assertTypeSafeRequestSize, buildTypeSafeRequest } from "./request";

describe("TypeSafe image request mapping", () => {
	it("counts UTF-8 and JSON escaping at the exact request boundary", () => {
		const request = { state: { '☕': ['🙂"\n\u0000\ud800', true, 1.5, null, undefined] }, omitted: undefined };
		const bytes = new TextEncoder().encode(JSON.stringify(request)).byteLength;
		expect(() => assertTypeSafeRequestSize(request, bytes)).not.toThrow();
		expect(() => assertTypeSafeRequestSize(request, bytes - 1)).toThrow("32 MiB");
	});
	it("rejects the combined image body before serializing the request", () => {
		const image = { content_type: "image/png" as const, base64: "A".repeat(16 * 1024 * 1024) };
		const stringify = vi.spyOn(JSON, "stringify");
		try {
			expect(() => buildTypeSafeRequest({ model: "typesafe/jev-1.14.0", state: "Photo", questions: {}, images: [image, image] }, "jev-1.14.0")).toThrow("32 MiB");
			expect(stringify).not.toHaveBeenCalled();
		} finally { stringify.mockRestore(); }
	});
	it("embeds native images in order and preserves literal placeholder text", () => {
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({ model: "typesafe/jev-1.14.0",
			input: [{ role: "user", content: [
				{ type: "input_text", text: "Literal [Image 0]" },
				{ type: "input_image", image_url: "data:image/png;base64,AQID" },
				{ type: "input_image", image_url: "data:image/jpeg;base64,BAUG" },
			] }], questions: [{ type: "box", instructions: "The mug in the first image" }],
		}));
		const body = JSON.parse(buildTypeSafeRequest(ir, "jev-1.14.0"));
		const refs = Object.keys(body.assets);
		expect(refs).toHaveLength(2);
		expect(body.state[0].content).toBe(`Literal [Image 0]\n[Image 0]: ${refs[0]}\n[Image 1]: ${refs[1]}`);
		expect(body.assets[refs[0]]).toEqual({ type: "image", format: "png", data_base64: "AQID" });
		expect(body.assets[refs[1]]).toEqual({ type: "image", format: "jpg", data_base64: "BAUG" });
	});
	it("adds referenced legacy images without changing the original state", () => {
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({ state: { photo: "Description" },
			images: [{ content_type: "image/png", base64: "AQID" }], questions: { visible: { type: "noul", instructions: "Visible?" } },
		}));
		const body = JSON.parse(buildTypeSafeRequest(ir, "jev-1.13.0"));
		expect(body.state).toEqual({ state: { photo: "Description" }, images: Object.keys(body.assets) });
		expect(ir.state).toEqual({ photo: "Description" });
	});
	it("rejects unsupported image formats and oversized images", () => {
		const ir = { model: "typesafe/jev-1.13.0", state: "Photo", questions: {} };
		expect(() => buildTypeSafeRequest({ ...ir, images: ["data:image/webp;base64,AQID"] }, "jev-1.13.0")).toThrow("PNG or JPEG");
		expect(() => buildTypeSafeRequest({ ...ir, images: ["data:image/png;base64," + "A".repeat(4 * Math.ceil(16 * 1024 * 1024 / 3) + 4)] }, "jev-1.13.0")).toThrow("16 MiB");
	});
});
