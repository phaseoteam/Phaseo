export const coerceResponseText = (value: unknown) => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        return value
            .map((entry) => {
                if (typeof entry === "string") return entry;
                if (entry && typeof entry === "object") {
                    const typeValue = (entry as { type?: string }).type;
                    if (typeValue === "output_text") {
                        return (entry as { text?: string }).text ?? "";
                    }
                    return (entry as { text?: string }).text ?? "";
                }
                return "";
            })
            .filter(Boolean)
            .join("");
    }
    return "";
};

export const extractOutputText = (output: unknown) => {
    if (!Array.isArray(output)) return "";
    for (const item of output) {
        if (!item) continue;
        if (typeof item === "string") return item;
        if (typeof (item as any).text === "string") {
            return (item as any).text;
        }
        if (Array.isArray((item as any).content)) {
            const contentText = coerceResponseText((item as any).content);
            if (contentText) return contentText;
        }
        if ((item as any).content) {
            const contentText = coerceResponseText((item as any).content);
            if (contentText) return contentText;
        }
    }
    return "";
};

export const extractResponseText = (payload: any) => {
    const candidates = [
        payload?.choices?.[0]?.message?.content,
        payload?.choices?.[0]?.delta?.content,
        coerceResponseText(payload?.output_text),
        coerceResponseText(payload?.response?.output_text),
        extractOutputText(payload?.output),
        extractOutputText(payload?.response?.output),
        coerceResponseText(payload?.response?.output?.[0]?.content),
    ];
    for (const candidate of candidates) {
        if (candidate) return candidate;
    }
    return "";
};


type ExtractedImage = {
	url?: string;
	data?: string;
	mimeType?: string;
};

const coerceImageUrl = (value: any): string | null => {
	if (!value) return null;
	if (typeof value === "string") return value;
	if (typeof value?.url === "string") return value.url;
	return null;
};

const coerceImageData = (value: any): string | null => {
	if (!value) return null;
	if (typeof value === "string") return value;
	if (typeof value?.b64_json === "string") return value.b64_json;
	if (typeof value?.data === "string") return value.data;
	return null;
};

const extractImagesFromContent = (content: any): ExtractedImage[] => {
	if (!Array.isArray(content)) return [];
	const images: ExtractedImage[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const type = part.type;
		if (type === "output_image" || type === "image" || type === "image_url") {
			const url = coerceImageUrl(part.image_url ?? part.url);
			const data = coerceImageData(part);
			if (url || data) {
				images.push({
					url: url ?? (data ? `data:${part.mime_type || "image/png"};base64,${data}` : undefined),
					data: data ?? undefined,
					mimeType: part.mime_type ?? part.mimeType ?? undefined,
				});
			}
		}
	}
	return images;
};

const extractImagesFromOutputItems = (output: any): ExtractedImage[] => {
	if (!Array.isArray(output)) return [];
	const images: ExtractedImage[] = [];
	for (const item of output) {
		if (!item || typeof item !== "object") continue;
		if (item.type === "message" && Array.isArray(item.content)) {
			images.push(...extractImagesFromContent(item.content));
		}
		if (item.type === "image_generation_call") {
			const data = coerceImageData(item);
			if (data) {
				images.push({
					url: `data:image/png;base64,${data}`,
					data,
					mimeType: "image/png",
				});
			}
		}
	}
	return images;
};

export const extractResponseImages = (payload: any): ExtractedImage[] => {
	const images: ExtractedImage[] = [];
	images.push(...extractImagesFromOutputItems(payload?.output));
	images.push(...extractImagesFromOutputItems(payload?.response?.output));
	const content = payload?.choices?.[0]?.message?.content;
	if (Array.isArray(content)) {
		images.push(...extractImagesFromContent(content));
	}
	return images;
};

export const appendImagesToText = (text: string, images: ExtractedImage[]) => {
	if (!images.length) return text;
	const rendered = images
		.map((img, idx) => {
			const src = img.url ?? (img.data ? `data:${img.mimeType || "image/png"};base64,${img.data}` : "");
			if (!src) return "";
			return `

![Generated image ${idx + 1}](${src})`;
		})
		.filter(Boolean)
		.join("");
	return `${text}${rendered}`;
};

/**
 * Extract reasoning/thinking text from Responses API format
 *
 * The gateway always returns responses in the format matching the endpoint called.
 * Since the web app calls /responses, we only need to parse Responses API format:
 * - reasoning.summary
 * - output items with type "reasoning"
 */
export const extractReasoningText = (payload: any) => {
    const ignoredSummaries = new Set(["auto", "detailed"]);
    const candidates: string[] = [];

    // 1. Check Responses API reasoning.summary
    const reasoning = payload?.reasoning ?? payload?.response?.reasoning;
    const summary = reasoning?.summary;
    if (typeof summary === "string") {
        const trimmed = summary.trim().toLowerCase();
        if (summary && !ignoredSummaries.has(trimmed)) {
            candidates.push(summary);
        }
    } else if (Array.isArray(summary)) {
        const joined = summary
            .map((item: any) =>
                typeof item === "string" ? item : item?.text ?? ""
            )
            .filter(Boolean)
            .join("\n");
        if (joined) {
            const trimmed = joined.trim().toLowerCase();
            if (!ignoredSummaries.has(trimmed)) {
                candidates.push(joined);
            }
        }
    }
    // 2. Check Responses API output items
    const outputs = payload?.output ?? payload?.response?.output;
    if (Array.isArray(outputs)) {
        for (const item of outputs) {
            if (item?.type !== "reasoning") continue;
            if (typeof item.summary === "string") {
                candidates.push(item.summary);
            } else if (Array.isArray(item.summary)) {
                const joined = item.summary
                    .map((entry: any) =>
                        typeof entry === "string" ? entry : entry?.text ?? ""
                    )
                    .filter(Boolean)
                    .join("\n");
                if (joined) candidates.push(joined);
            }
            if (Array.isArray(item.content)) {
                const contentText = coerceResponseText(item.content);
                if (contentText) candidates.push(contentText);
            } else if (typeof item.content === "string") {
                candidates.push(item.content);
            }
        }
    }

    // Return first non-empty candidate
    for (const candidate of candidates) {
        if (candidate) return candidate;
    }
    return "";
};
