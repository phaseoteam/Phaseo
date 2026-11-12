import { describe, expect, it } from "vitest";
import { extractPdfText } from "./pdfText";

function document(text: string, count = 1) {
	const stream = `BT /F1 12 Tf 20 50 Td (${text}) Tj ET`;
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		`<< /Type /Pages /Kids [${Array.from({ length: count }, () => "3 0 R").join(" ")}] /Count ${count} >>`,
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
		`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	];
	let pdf = "%PDF-1.4\n"; const offsets = [0];
	for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
	const xref = Buffer.byteLength(pdf);
	pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return Buffer.from(pdf);
}
describe("isolated PDF extraction", () => {
	it("extracts real PDF text with page provenance", async () => {
		expect(await extractPdfText(document("Fixture document"))).toEqual({ text: "Page 1\nFixture document", pages: 1 });
	}, 25000);
	it("rejects documents over the page limit and PDFs without readable text", async () => {
		await expect(extractPdfText(document("Fixture", 201))).rejects.toThrow("200 pages");
		await expect(extractPdfText(document(""))).rejects.toThrow("no readable text");
	}, 25000);
});
