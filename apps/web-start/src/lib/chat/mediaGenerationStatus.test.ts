import {
	normalizeMediaGenerationStatus,
	toMediaEntryStatus,
} from "@/lib/chat/mediaGenerationStatus";

describe("media generation status", () => {
	it("normalizes completed synonyms", () => {
		expect(normalizeMediaGenerationStatus("COMPLETED")).toBe("completed");
		expect(normalizeMediaGenerationStatus("done")).toBe("completed");
		expect(normalizeMediaGenerationStatus("succeeded")).toBe("completed");
	});

	it("normalizes failure and pending synonyms", () => {
		expect(normalizeMediaGenerationStatus("error")).toBe("failed");
		expect(normalizeMediaGenerationStatus("cancelled")).toBe("failed");
		expect(normalizeMediaGenerationStatus("in_progress")).toBe("pending");
		expect(normalizeMediaGenerationStatus("processing")).toBe("pending");
	});

	it("derives entry status from raw status and urls", () => {
		expect(toMediaEntryStatus({ rawStatus: "failed", hasUrls: true })).toBe(
			"completed",
		);
		expect(toMediaEntryStatus({ rawStatus: "completed", hasUrls: false })).toBe(
			"completed",
		);
		expect(toMediaEntryStatus({ rawStatus: "mystery", hasUrls: false })).toBe(
			"pending",
		);
	});
});

