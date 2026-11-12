import { describe, expect, it } from "vitest";
import { swipeStep, type Direction, type Swipe } from "./HistoryNavigation";

const wheel = (deltaX: number, deltaY = 0, extra: Partial<{ ctrlKey: boolean; pixels: boolean }> = {}) => ({ deltaX, deltaY, ctrlKey: false, pixels: true, target: null, y: 300, ...extra });
const run = (events: ReturnType<typeof wheel>[], can: (direction: Direction) => boolean = () => true, scrolls = () => false) => events.reduce<Swipe | null>((gesture, event) => swipeStep(gesture, event, can, scrolls), null);

describe("trackpad swipes", () => {
	it("tracks a sideways swipe towards back or forward", () => {
		expect(run([wheel(-5), wheel(-5), wheel(-40)])).toEqual({ kind: "tracking", direction: "back", distance: 50, y: 300 });
		expect(run([wheel(10), wheel(30)])).toMatchObject({ kind: "tracking", direction: "forward", distance: 40 });
	});
	it("leaves scrolling, pinch zoom, line scrolling and sideways-scrolling content alone", () => {
		expect(run([wheel(2, 20), wheel(-30)])).toEqual({ kind: "ignored" });
		expect(run([wheel(-20, 0, { ctrlKey: true })])).toEqual({ kind: "ignored" });
		expect(run([wheel(-20, 0, { pixels: false })])).toEqual({ kind: "ignored" });
		expect(run([wheel(-20)], () => true, () => true)).toEqual({ kind: "ignored" });
	});
	it("ignores a swipe with nowhere to go", () => {
		expect(run([wheel(-20)], direction => direction === "forward")).toEqual({ kind: "ignored" });
	});
	it("swiping back the other way shortens the distance, never below zero", () => {
		expect(run([wheel(-20), wheel(10), wheel(30)])).toMatchObject({ kind: "tracking", direction: "back", distance: 0 });
	});
});
