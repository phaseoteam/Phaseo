import { describe, expect, it } from "vitest";

import {
	normalizeVideoStatus,
	normalizeVideoStatusFilter,
	parseVideoListStatuses,
} from "./status";

describe("video status helpers", () => {
	it("normalizes public video statuses for list responses", () => {
		expect(normalizeVideoStatus("pending")).toBe("processing");
		expect(normalizeVideoStatus("in_progress")).toBe("processing");
		expect(normalizeVideoStatus("completed")).toBe("completed");
		expect(normalizeVideoStatus("cancelled")).toBe("cancelled");
		expect(normalizeVideoStatus("expired")).toBe("expired");
	});

	it("accepts public filter values for the video lifecycle", () => {
		expect(normalizeVideoStatusFilter("queued")).toBe("queued");
		expect(normalizeVideoStatusFilter("processing")).toBe("processing");
		expect(normalizeVideoStatusFilter("completed")).toBe("completed");
		expect(normalizeVideoStatusFilter("failed")).toBe("failed");
		expect(normalizeVideoStatusFilter("cancelled")).toBe("cancelled");
		expect(normalizeVideoStatusFilter("expired")).toBe("expired");
	});

	it("expands list filters to match stored internal aliases", () => {
		const url = new URL("https://api.phaseo.app/v1/videos?status=processing,cancelled,expired");
		expect(parseVideoListStatuses(url)).toEqual([
			"processing",
			"in_progress",
			"running",
			"cancelled",
			"canceled",
			"expired",
		]);
	});
});
