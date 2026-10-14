import type { IRDecisionsRequest } from "@core/ir";

const MiB = 1024 * 1024;

// Preserve image placement without replacing user text resembling placeholders.
export function buildTypeSafeRequest(ir: IRDecisionsRequest, model: string) {
	const assets: Record<string, { type: "image"; format: "png" | "jpg"; data_base64: string }> = {};
	const references = (ir.images ?? []).map(image => {
		const match = typeof image === "string" ? /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(image) : null;
		const contentType = typeof image === "string" ? match?.[1].toLowerCase() : image.content_type.slice(6);
		const data = typeof image === "string" ? match?.[2] : image.base64;
		if (!data || !["png", "jpeg", "jpg"].includes(contentType ?? "")) {
			throw new Error("TypeSafe images must be inline PNG or JPEG base64 data.");
		}
		const bytes = data.length * 3 / 4 - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
		if (bytes > 16 * MiB) throw new RangeError("TypeSafe accepts at most 16 MiB per image.");
		try { if (atob(data).length === 0) throw new Error(); } catch {
			throw new Error("TypeSafe images must contain valid base64 data.");
		}
		const reference = crypto.randomUUID();
		assets[reference] = { type: "image", format: contentType === "png" ? "png" : "jpg", data_base64: data };
		return reference;
	});
	let state = ir.state;
	if (references.length) {
		const input = ir.decisionContext?.input;
		if (input && typeof input !== "string") {
			let imageIndex = 0;
			state = input.map(message => ({ role: message.role, content: typeof message.content === "string"
				? message.content : message.content.map(part => part.type === "input_text" ? part.text
					: `[Image ${imageIndex}]: ${references[imageIndex++]}`).join("\n") }));
		} else {
			state = { state: ir.state, images: references };
		}
	}
	const body = JSON.stringify({ model, state, questions: ir.questions,
		...(references.length ? { assets } : {}) });
	if (new TextEncoder().encode(body).byteLength > 32 * MiB) throw new RangeError("TypeSafe request bodies must be at most 32 MiB.");
	return body;
}
