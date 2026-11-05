import { afterEach, expect, it, vi } from "vitest";
import { readSidebarWidth, sidebarSurface, sidebarWidthKey } from "./sidebarWidth";

afterEach(() => { vi.unstubAllGlobals(); });
const storage = (entries: Record<string, unknown>) => { const values = new Map(Object.entries(entries).map(([key, value]) => [key, JSON.stringify(value)])); vi.stubGlobal("window", { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } }); };

it("names the surface: Chat, Code, or Factory inside Code", () => {
	expect([sidebarSurface("chat", "factory"), sidebarSurface("code"), sidebarSurface("code", "factory")]).toEqual(["chat", "code", "factory"]);
});

it("keeps each surface's width apart, starting from the width they used to share", () => {
	storage({ "phaseo.desktop.sidebarWidth": 300, [sidebarWidthKey("factory")]: 420 });
	expect([readSidebarWidth("chat"), readSidebarWidth("code"), readSidebarWidth("factory")]).toEqual([300, 300, 420]);
	storage({ [sidebarWidthKey("code")]: 9999 });
	expect([readSidebarWidth("chat"), readSidebarWidth("code")]).toEqual([256, 480]);
});
