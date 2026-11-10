import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportToPDF } from "./export-utils";

const pdf = vi.hoisted(() => ({ text: vi.fn(), save: vi.fn(), autoTable: vi.fn() }));

vi.mock("jspdf", () => ({
	jsPDF: class {
		setFontSize() {}
		setTextColor() {}
		text = pdf.text;
		save = pdf.save;
	},
}));
vi.mock("jspdf-autotable", () => ({ default: pdf.autoTable }));

describe("exportToPDF", () => {
	beforeEach(() => vi.clearAllMocks());

	it("saves a table of the rows", async () => {
		await exportToPDF([{ Model: "openai/gpt-6.1-terra", Requests: 3 }], "gateway-requests", "Requests");

		expect(pdf.text).toHaveBeenCalledWith("Requests", 14, 15);
		expect(pdf.autoTable).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ head: [["Model", "Requests"]], body: [["openai/gpt-6.1-terra", "3"]] }),
		);
		expect(pdf.save).toHaveBeenCalledWith("gateway-requests.pdf");
	});

	it("skips an empty export", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});

		await exportToPDF([], "empty", "Empty");

		expect(pdf.save).not.toHaveBeenCalled();
	});
});
