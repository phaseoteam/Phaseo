import {
	buildProfileShareCardPayload,
	buildProfileShareCardPageUrl,
	parseProfileShareCardToken,
} from "./profileShare"

describe("profile share helpers", () => {
	it("builds a compact share payload from a profile snapshot", () => {
		const payload = buildProfileShareCardPayload({
			userId: "user-1",
			displayName: "Daniel Butler",
			email: null,
			avatarUrl: null,
			memberSince: "2025-08-10T00:00:00.000Z",
			workspaceName: "Personal",
			publicProfileEnabled: false,
			publicProfileSlug: "daniel-butler-user1",
			shareUrl: "http://localhost:3000/profile/daniel-butler-user1",
			requestSeries: [],
			tokenSeries: [],
			activitySeries30: [],
			requestChange: null,
			tokenChange: null,
			totalRequests: 1234,
			totalTokens: 567890,
			avgPerDay: 3.4,
			avgPerWeek: 23.8,
			currentStreak: 4,
			longestStreak: 9,
			activeDays: 10,
			topModels: [],
			heatmapDays: [],
			creditsUsage: { today: "$0.0000", week: "$0.0000", month: "$0.0000" },
			byokUsage: { today: "$0.0000", week: "$0.0000", month: "$0.0000" },
		})

		expect(payload).toEqual({
			displayName: "Daniel Butler",
			workspaceName: "Personal",
			memberSinceLabel: "Aug 2025",
			totalRequests: 1234,
			totalTokens: 567890,
			longestStreak: 9,
			avgPerWeek: 23.8,
		})
	})

	it("round-trips share card tokens through the public share URL", () => {
		const url = new URL(
			buildProfileShareCardPageUrl({
				displayName: "Daniel Butler",
				workspaceName: "Personal",
				memberSinceLabel: "Aug 2025",
				totalRequests: 1234,
				totalTokens: 567890,
				longestStreak: 9,
				avgPerWeek: 23.8,
			}),
		)

		const token = url.pathname.split("/").pop() ?? ""

		expect(parseProfileShareCardToken(token)).toEqual({
			displayName: "Daniel Butler",
			workspaceName: "Personal",
			memberSinceLabel: "Aug 2025",
			totalRequests: 1234,
			totalTokens: 567890,
			longestStreak: 9,
			avgPerWeek: 23.8,
		})
	})
})
