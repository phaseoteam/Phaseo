export function sseResponse(frames: Array<any | string>, init?: ResponseInit): Response {
    const encoder = new TextEncoder();
    const lines = frames.map((frame) => {
        const data = typeof frame === "string" ? frame : JSON.stringify(frame);
        return `data: ${data}\n\n`;
    }).join("");

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(encoder.encode(lines));
            controller.close();
        },
    });

    return new Response(stream, {
        status: init?.status ?? 200,
        headers: {
            "Content-Type": "text/event-stream",
            ...(init?.headers ?? {}),
        },
    });
}

export async function readSseFrames(res: Response): Promise<string[]> {
    if (!res.body) return [];
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const frames: string[] = [];

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split(/\r?\n\r?\n/);
        buf = parts.pop() ?? "";
        for (const raw of parts) {
            frames.push(raw);
        }
    }

    if (buf.trim().length) frames.push(buf);
    return frames;
}

export function parseSseJson(frames: string[]): any[] {
    const out: any[] = [];
    for (const raw of frames) {
        let data = "";
        for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.replace(/\r$/, "");
            if (trimmed.startsWith("data:")) {
                data += trimmed.slice(5).trimStart();
            }
        }
        if (!data) continue;
        if (data === "[DONE]") {
            out.push("[DONE]");
            continue;
        }
        try {
            out.push(JSON.parse(data));
        } catch {
            out.push(data);
        }
    }
    return out;
}

export type ParsedSseFrame = {
	eventName: string | null;
	data: string;
	json: any | null;
};

export function parseSseFrames(frames: string[]): ParsedSseFrame[] {
	const out: ParsedSseFrame[] = [];
	for (const raw of frames) {
		let eventName: string | null = null;
		let data = "";
		for (const line of raw.split(/\r?\n/)) {
			const trimmed = line.replace(/\r$/, "");
			if (trimmed.startsWith("event:")) {
				eventName = trimmed.slice(6).trim() || null;
				continue;
			}
			if (trimmed.startsWith("data:")) {
				data += trimmed.slice(5).trimStart();
			}
		}
		if (!data) continue;
		if (data === "[DONE]") {
			out.push({
				eventName,
				data,
				json: null,
			});
			continue;
		}
		try {
			out.push({
				eventName,
				data,
				json: JSON.parse(data),
			});
		} catch {
			out.push({
				eventName,
				data,
				json: null,
			});
		}
	}
	return out;
}
