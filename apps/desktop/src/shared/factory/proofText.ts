/**
 * Text proof as it was meant to read. Agents on Windows often save output with PowerShell's `>`, which
 * writes UTF-16, and test runners colour their output with terminal codes; both read as noise if shown as is.
 */
export function decodeProofText(bytes: Uint8Array): string {
	const text = decode(bytes);
	return text
		// Terminal colours and cursor moves, such as ESC[32m.
		.replace(new RegExp(String.raw`${ESC}\[[0-?]*[ -/]*[@-~]`, "g"), "")
		.replace(/\r\n?/g, "\n");
}

const ESC = String.fromCharCode(27);

function decode(bytes: Uint8Array): string {
	if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
	if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
	if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
	// UTF-16 without a byte-order mark: mostly-English text has a zero in every other byte.
	const sample = bytes.subarray(0, 4_000);
	let evenZeros = 0;
	let oddZeros = 0;
	for (let index = 0; index < sample.length; index++) {
		if (sample[index] !== 0) continue;
		if (index % 2 === 0) evenZeros++;
		else oddZeros++;
	}
	const half = sample.length / 2;
	if (half >= 4 && oddZeros > half * 0.4 && evenZeros < half * 0.05) return new TextDecoder("utf-16le").decode(bytes);
	if (half >= 4 && evenZeros > half * 0.4 && oddZeros < half * 0.05) return new TextDecoder("utf-16be").decode(bytes);
	return new TextDecoder("utf-8").decode(bytes);
}

/** Whether text is a diff, so it can be shown with its added and removed lines marked. */
export function looksLikeDiff(text: string): boolean {
	return /^diff --git /m.test(text) || (/^--- /m.test(text) && /^\+\+\+ /m.test(text) && /^@@ /m.test(text));
}

export type DiffLineKind = "file" | "hunk" | "add" | "remove" | "context";

export function diffLineKind(line: string): DiffLineKind {
	if (/^(diff --git |index [0-9a-f]+\.\.|--- |\+\+\+ |new file mode|deleted file mode|similarity index|rename (from|to) )/.test(line)) return "file";
	if (line.startsWith("@@")) return "hunk";
	if (line.startsWith("+")) return "add";
	if (line.startsWith("-")) return "remove";
	return "context";
}
