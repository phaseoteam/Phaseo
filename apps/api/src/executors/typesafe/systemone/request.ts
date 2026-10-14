import type { IRDecisionsRequest } from "@core/ir";

const MiB = 1024 * 1024;

// Count the JSON's UTF-8 bytes before allocating the serialized request. Public
// state and questions are JSON values; base64 asset data is known ASCII.
export function assertTypeSafeRequestSize(value: unknown, maxBytes = 32 * MiB): void {
	let bytes = 0;
	const add = (count: number) => {
		bytes += count;
		if (bytes > maxBytes) throw new RangeError("TypeSafe request bodies must be at most 32 MiB.");
	};
	const string = (text: string) => {
		add(2);
		for (let index = 0; index < text.length; index++) {
			const code = text.charCodeAt(index);
			if (code === 34 || code === 92) add(2);
			else if (code < 32) add([8, 9, 10, 12, 13].includes(code) ? 2 : 6);
			else if (code < 128) add(1);
			else if (code < 2048) add(2);
			else if (code >= 0xd800 && code <= 0xdbff && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
				add(4);
				index++;
			} else add(code >= 0xd800 && code <= 0xdfff ? 6 : 3);
		}
	};
	const visit = (item: unknown, asset = false) => {
		if (typeof item === "string") string(item);
		else if (item === null || item === undefined) add(4);
		else if (typeof item !== "object") add(JSON.stringify(item).length);
		else if (Array.isArray(item)) {
			add(2 + Math.max(0, item.length - 1));
			for (const child of item) visit(child);
		} else {
			add(2);
			let count = 0;
			for (const [key, child] of Object.entries(item)) {
				if (child === undefined) continue;
				if (count++) add(1);
				string(key);
				add(1);
				if (asset && key === "data_base64" && typeof child === "string") add(child.length + 2);
				else visit(child, (item === value && key === "assets") || asset);
			}
		}
	};
	visit(value);
}

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
		try {
			// Validate in base64-aligned chunks without decoding a whole image.
			for (let offset = 0; offset < data.length; offset += 64 * 1024) atob(data.slice(offset, offset + 64 * 1024));
		} catch {
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
	const request = { model, state, questions: ir.questions, ...(references.length ? { assets } : {}) };
	assertTypeSafeRequestSize(request);
	return JSON.stringify(request);
}
