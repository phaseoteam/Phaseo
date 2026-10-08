import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";

let active = 0; const waiting: (() => void)[] = [];
export async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
	if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve));
	else active++;
	try {
		return await new Promise((resolve, reject) => {
			const data = Uint8Array.from(bytes);
			const worker = new Worker(path.join(path.dirname(fileURLToPath(import.meta.url)), "pdfWorker.mjs"), { workerData: data, transferList: [data.buffer], resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 } });
			let settled = false;
			const finish = (error?: Error, result?: { text: string; pages: number }) => {
				if (settled) return; settled = true; clearTimeout(timeout); void worker.terminate();
				if (error) reject(error); else resolve(result!);
			};
			const timeout = setTimeout(() => finish(new Error("PDF extraction timed out. Try a smaller document.")), 20000);
			worker.on("message", (message: { text?: unknown; pages?: unknown; error?: unknown }) => {
				if (typeof message.error === "string") finish(new Error(message.error));
				else if (typeof message.text === "string" && typeof message.pages === "number") finish(undefined, { text: message.text, pages: message.pages });
				else finish(new Error("PDF extraction returned an invalid result."));
			});
			worker.on("error", error => finish(error instanceof Error ? error : new Error("PDF extraction failed."))); worker.on("exit", () => finish(new Error("PDF extraction stopped before completing.")));
		});
	} finally { const next = waiting.shift(); if (next) next(); else active--; }
}
