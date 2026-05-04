import { describe, expect, it } from "vitest";

import { parseAsyncWebsocketOptions } from "./async-jobs";

describe("parseAsyncWebsocketOptions", () => {
	it("uses safe defaults", () => {
		expect(
			parseAsyncWebsocketOptions(new URL("https://api.phaseo.app/v1/async/video/job_123/ws")),
		).toEqual({
			intervalMs: 2500,
			closeOnTerminal: true,
		});
	});

	it("clamps the polling interval and honors close_on_terminal", () => {
		expect(
			parseAsyncWebsocketOptions(
				new URL(
					"https://api.phaseo.app/v1/async/batch/job_123/ws?interval_ms=100&close_on_terminal=false",
				),
			),
		).toEqual({
			intervalMs: 1000,
			closeOnTerminal: false,
		});

		expect(
			parseAsyncWebsocketOptions(
				new URL("https://api.phaseo.app/v1/async/batch/job_123/ws?interval_ms=60000"),
			),
		).toEqual({
			intervalMs: 10000,
			closeOnTerminal: true,
		});
	});
});
