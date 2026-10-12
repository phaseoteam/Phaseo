import { expect, it } from "vitest";
import type { Message, AgentActivity } from "../../shared/workspace";
import { conversationTurns, turnDuration } from "./conversationTurns";
it("groups complete turns while preserving commentary and tool order", () => {
	const messages = [{id:"u",role:"user",text:"Inspect",timelineOrder:1},{id:"comment",role:"assistant",text:"Checking",timelineOrder:2},{id:"final",role:"assistant",text:"Done",timelineOrder:4},{id:"next",role:"user",text:"Again",timelineOrder:5}] as Message[];
	const activities = [{id:"u:tool",type:"tool",timelineOrder:3}] as AgentActivity[];
	const turns = conversationTurns(messages, activities);
	expect(turns.map(turn => turn.id)).toEqual(["u","next"]);
	expect(turns[0].entries.map(entry => entry.value.id)).toEqual(["comment","u:tool","final"]);
});
it("retains partial history and never fabricates duration", () => {
	expect(conversationTurns([{id:"final",role:"assistant",text:"Done"}] as Message[],[])[0].entries).toHaveLength(1);
	expect(turnDuration()).toBe("Worked");
	expect(turnDuration({startedAt:"2026-10-05T00:00:00Z",completedAt:"2026-10-05T00:01:06Z"} as Message)).toBe("Worked for 1m 6s");
});
