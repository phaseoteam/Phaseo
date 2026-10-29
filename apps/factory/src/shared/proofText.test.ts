import { describe, expect, it } from "vitest";
import { decodeProofText, diffLineKind, looksLikeDiff } from "./proofText";

const utf16 = (text: string, bom: boolean) => {
	const body = new Uint8Array(text.length * 2);
	for (let index = 0; index < text.length; index++) body[index * 2] = text.charCodeAt(index);
	return bom ? new Uint8Array([0xff, 0xfe, ...body]) : body;
};

describe("text proof", () => {
	it("reads what PowerShell's > wrote, with or without a byte-order mark", () => {
		expect(decodeProofText(utf16("diff --git a/x b/x\r\n+ok\r\n", true))).toBe("diff --git a/x b/x\n+ok\n");
		expect(decodeProofText(utf16("6 passed, 0 failed\r\n", false))).toBe("6 passed, 0 failed\n");
	});

	it("reads UTF-8, drops its byte-order mark, and strips terminal colours", () => {
		const bytes = new TextEncoder().encode("﻿\x1b[32m✔ adds up a basket\x1b[39m £5");
		expect(decodeProofText(bytes)).toBe("✔ adds up a basket £5");
	});

	it("knows a diff and its lines", () => {
		expect(looksLikeDiff("diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b")).toBe(true);
		expect(looksLikeDiff("- one\n- two")).toBe(false);
		expect(["--- a/x", "+++ b/x", "@@ -1 +1 @@", "+b", "-a", " c"].map(diffLineKind)).toEqual(["file", "file", "hunk", "add", "remove", "context"]);
	});
});
