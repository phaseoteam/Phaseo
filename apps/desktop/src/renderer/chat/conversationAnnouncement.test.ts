import { describe, expect, it } from "vitest";
import { nextAnnouncement } from "./conversationAnnouncement";

describe("conversation announcements", () => {
	it("stays silent for the first snapshot and while streaming", () => {
		expect(nextAnnouncement(undefined, { status: "running" })).toBeUndefined();
		expect(nextAnnouncement({ status: "running" }, { status: "running" })).toBeUndefined();
	});
	it("says when a turn starts, needs the person and ends", () => {
		expect(nextAnnouncement({ status: "idle" }, { status: "running" })).toBe("Working");
		expect(nextAnnouncement({ status: "running" }, { status: "waiting", approval: "a1" })).toBe("Needs approval");
		expect(nextAnnouncement({ status: "waiting", approval: "a1" }, { status: "waiting", approval: "a1" })).toBeUndefined();
		expect(nextAnnouncement({ status: "running" }, { status: "waiting", input: "q1" })).toBe("Needs your input");
		expect(nextAnnouncement({ status: "running" }, { status: "completed" })).toBe("Done");
		expect(nextAnnouncement({ status: "running" }, { status: "failed" })).toBe("Failed");
		expect(nextAnnouncement({ status: "waiting" }, { status: "interrupted" })).toBe("Stopped");
	});
});
