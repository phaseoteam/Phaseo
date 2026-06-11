import { describe, expect, it } from "vitest";

import {
	isVideoApiEnabled,
	parseVideoDownloadUrlRequestBody,
} from "./videos";

describe("videos route contract helpers", () => {
	it("keeps video api disabled unless explicitly enabled", () => {
		expect(isVideoApiEnabled(undefined)).toBe(false);
		expect(isVideoApiEnabled("")).toBe(false);
		expect(isVideoApiEnabled("true")).toBe(true);
		expect(isVideoApiEnabled("1")).toBe(true);
		expect(isVideoApiEnabled("yes")).toBe(true);
		expect(isVideoApiEnabled("on")).toBe(true);
		expect(isVideoApiEnabled("false")).toBe(false);
		expect(isVideoApiEnabled("0")).toBe(false);
		expect(isVideoApiEnabled("off")).toBe(false);
	});

	it("parses a valid video download url request body", () => {
		expect(
			parseVideoDownloadUrlRequestBody({
				ttl_seconds: 600,
				disposition: "inline",
				index: 2,
			}),
		).toEqual({
			ttlSeconds: 600,
			disposition: "inline",
			index: 2,
		});
	});

	it("falls back to safe defaults for an empty video download request body", () => {
		expect(parseVideoDownloadUrlRequestBody(null)).toEqual({
			ttlSeconds: null,
			disposition: "attachment",
			index: 0,
		});
	});

	it("rejects invalid video download url request bodies", () => {
		expect(
			parseVideoDownloadUrlRequestBody({
				ttl_seconds: 0,
			}),
		).toBeNull();
		expect(
			parseVideoDownloadUrlRequestBody({
				disposition: "download",
			}),
		).toBeNull();
		expect(
			parseVideoDownloadUrlRequestBody({
				index: -1,
			}),
		).toBeNull();
		expect(parseVideoDownloadUrlRequestBody([])).toBeNull();
	});
});
