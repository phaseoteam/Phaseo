import { parentPort, workerData } from "node:worker_threads";
import { Buffer } from "node:buffer";
import { getDocumentProxy } from "unpdf";

let document;
let result;
try {
	document = await getDocumentProxy(workerData, { isEvalSupported: false, maxImageSize: 16_777_216, useSystemFonts: false, disableFontFace: true });
	if (document.numPages > 200) throw new Error("PDF attachments support up to 200 pages.");
	const pages = []; let textBytes = 0; let readable = false;
	for (let index = 1; index <= document.numPages; index++) {
		const page = await document.getPage(index);
		try {
			const content = await page.getTextContent();
			const text = content.items.map(item => typeof item.str === "string" ? `${item.str}${item.hasEOL ? "\n" : " "}` : "").join("").trim();
			if (text) readable = true;
			textBytes += Buffer.byteLength(text);
			if (textBytes > 2 * 1024 * 1024) throw new Error("The extracted PDF text exceeds 2 MB.");
			pages.push(`Page ${index}\n${text}`);
		} finally { page.cleanup(); }
	}
	if (!readable) throw new Error("This PDF has no readable text. Use OCR or attach its pages as images.");
	result = { text: pages.join("\n\n"), pages: document.numPages };
} catch (error) { result = { error: error instanceof Error ? error.message : "PDF extraction failed." }; }
finally {
	try { await document?.loadingTask.destroy(); }
	catch (error) { if (!result?.error) result = { error: error instanceof Error ? error.message : "PDF cleanup failed." }; }
}
parentPort?.postMessage(result);
