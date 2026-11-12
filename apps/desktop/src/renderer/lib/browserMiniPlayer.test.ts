import { describe, expect, it } from "vitest";
import { clampMiniPlayerPosition, miniPlayerEdgeGap, miniPlayerHandleSpace, miniPlayerSource, miniPlayerStates, resizeMiniPlayer, resolveMiniPlayerFrame } from "./browserMiniPlayer";

const chat = { width: 1000, height: 700 };
const wide = { width: 1600, height: 1000 };

describe("floating browser player layout", () => {
	it("starts at the top right, at most 320 × 320 at the page's aspect, below room for its handle", () => {
		expect(resolveMiniPlayerFrame({ source: wide }, chat)).toEqual({ x: chat.width - miniPlayerEdgeGap - 320, y: miniPlayerHandleSpace, width: 320, height: 200 });
		// A tall phone page keeps the minimum width and grows tall.
		expect(resolveMiniPlayerFrame({ source: { width: 390, height: 844 } }, chat)).toMatchObject({ width: 240, height: 519 });
	});
	it("never goes below 240 × 150 unless the chat is smaller", () => {
		const frame = resolveMiniPlayerFrame({ source: wide, width: 50 }, chat);
		expect(frame.width).toBe(240); expect(frame.height).toBe(150);
		const tiny = resolveMiniPlayerFrame({ source: wide, width: 400 }, { width: 200, height: 150 });
		expect(tiny.width).toBeLessThanOrEqual(200 - miniPlayerEdgeGap * 2);
	});
	it("keeps a saved size and place, clamped into a smaller window without forgetting them", () => {
		const state = { source: wide, width: 480, position: { x: 900, y: 600 } };
		const frame = resolveMiniPlayerFrame(state, chat);
		expect(frame).toEqual({ x: chat.width - miniPlayerEdgeGap - 480, y: chat.height - miniPlayerEdgeGap - 300, width: 480, height: 300 });
		expect(state.position).toEqual({ x: 900, y: 600 });
	});
	it("clamps dragging to the chat, leaving room above for the handle", () => {
		expect(clampMiniPlayerPosition({ x: -50, y: -50 }, chat, { width: 320, height: 200 })).toEqual({ x: miniPlayerEdgeGap, y: miniPlayerHandleSpace });
		expect(clampMiniPlayerPosition({ x: 5000, y: 5000 }, chat, { width: 320, height: 200 })).toEqual({ x: chat.width - 320 - miniPlayerEdgeGap, y: chat.height - 200 - miniPlayerEdgeGap });
	});
	it("resizes from any edge or corner at the page's aspect, the opposite edge staying put", () => {
		const start = { x: 400, y: 200, width: 320, height: 200 };
		const east = resizeMiniPlayer(start, "east", { x: 80, y: 0 }, wide, chat);
		expect(east).toEqual({ x: 400, y: 200, width: 400, height: 250 });
		const west = resizeMiniPlayer(start, "west", { x: -80, y: 0 }, wide, chat);
		expect(west.x + west.width).toBe(start.x + start.width); expect(west.width).toBe(400);
		const north = resizeMiniPlayer(start, "north", { x: 0, y: -50 }, wide, chat);
		expect(north.y + north.height).toBe(start.y + start.height); expect(north.height).toBe(250);
		const corner = resizeMiniPlayer(start, "southeast", { x: 80, y: 50 }, wide, chat);
		expect(corner.width / corner.height).toBeCloseTo(1.6, 1);
		// Growth stops at the chat's edge.
		expect(resizeMiniPlayer(start, "east", { x: 5000, y: 0 }, wide, chat).width).toBe(chat.width - miniPlayerEdgeGap - start.x);
	});
	it("uses the size the page had in the pane, else 16:10", () => {
		expect(miniPlayerSource({ width: 800.4, height: 600.6 })).toEqual({ width: 800, height: 601 });
		expect(miniPlayerSource({ width: 0, height: 600 })).toEqual({ width: 1280, height: 800 });
		expect(miniPlayerSource(undefined)).toEqual({ width: 1280, height: 800 });
	});
	it("restores saved players per chat, dropping tabs of other chats and invalid places", () => {
		expect(miniPlayerStates({
			chat: { tabId: "chat:1", open: true, source: { width: 800, height: 500 }, width: 300.2, position: { x: 10, y: 20 } },
			other: { tabId: "chat:1", open: true },
			closed: { tabId: "closed", open: false, position: { x: "a", y: 1 } },
			broken: "nope",
		})).toEqual({
			chat: { tabId: "chat:1", open: true, source: { width: 800, height: 500 }, width: 300, position: { x: 10, y: 20 } },
			closed: { tabId: "closed", open: false, source: { width: 1280, height: 800 } },
		});
		expect(miniPlayerStates([])).toEqual({});
	});
});
