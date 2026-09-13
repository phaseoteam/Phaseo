import { buildUptimeChartData } from "./ModelSuccessChart";

describe("buildUptimeChartData", () => {
	test("shows a consistent 100% uptime line when there are no requests", () => {
		const points = buildUptimeChartData(
			[],
			new Date("2026-08-30T10:42:00.000Z"),
		);

		expect(points).toHaveLength(24);
		expect(points[0]).toEqual({
			time: "11:00",
			overall: 100,
			worst: null,
			worstRequests: 0,
			bucket: "2026-08-29T11:00:00.000Z",
			requests: 0,
		});
		expect(points[23]).toEqual({
			time: "10:00",
			overall: 100,
			worst: null,
			worstRequests: 0,
			bucket: "2026-08-30T10:00:00.000Z",
			requests: 0,
		});
		expect(points.every((point) => point.overall === 100)).toBe(true);
	});

	test("treats empty hourly buckets as 100% uptime", () => {
		const points = buildUptimeChartData(
			[
				{
					bucket: "2026-08-30T10:00:00.000Z",
					overallSuccessPct: null,
					worstProviderSuccessPct: null,
					requests: 0,
				},
			],
			new Date("2026-08-30T10:42:00.000Z"),
		);
		const point = points.at(-1);

		expect(point?.overall).toBe(100);
		expect(point?.worst).toBe(100);
	});

	test("places observed uptime in its matching hourly bucket", () => {
		const points = buildUptimeChartData(
			[
				{
					bucket: "2026-08-30T09:27:00.000Z",
					overallSuccessPct: 98.5,
					worstProviderSuccessPct: 97,
					requests: 12,
				},
			],
			new Date("2026-08-30T10:42:00.000Z"),
		);

		expect(points.at(-2)).toMatchObject({
			time: "09:00",
			overall: 98.5,
			worst: 97,
			requests: 12,
		});
	});
});
