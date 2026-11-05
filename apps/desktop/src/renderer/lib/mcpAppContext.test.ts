import { expect, it } from "vitest";
import { setAppContext, takeAppContext } from "./mcpAppContext";

it("sends each app's latest note with the chat's next message, once", () => {
	setAppContext("chat", "app-1", "Weather", "Picked Leeds");
	setAppContext("chat", "app-1", "Weather", "Picked York");
	setAppContext("chat", "app-2", "Flights", "Chose the 9:40");
	setAppContext("other", "app-3", "Maps", "Zoomed in");
	expect(takeAppContext("chat")).toBe("\n\n[What I did in Weather: Picked York]\n\n[What I did in Flights: Chose the 9:40]");
	expect(takeAppContext("chat")).toBe("");
	expect(takeAppContext("other")).toContain("Maps");
});
