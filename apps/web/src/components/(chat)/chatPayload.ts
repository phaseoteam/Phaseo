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

export const extractReasoningText = (payload: any) => {
    const ignoredSummaries = new Set(["auto", "detailed"]);
    const candidates: string[] = [];
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
    for (const candidate of candidates) {
        if (candidate) return candidate;
    }
    return "";
};
