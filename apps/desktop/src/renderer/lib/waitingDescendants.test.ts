import { expect, it } from "vitest";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { waitingDescendants } from "./waitingDescendants";

const task = (id: string, parent?: string, approvalsCount = 0, archived = false) => ({ id, approvalsCount, archived, ...(parent ? { delegation: { parentTaskId: parent } } : {}) }) as unknown as TaskOverview;

it("finds the agents a chat started, and theirs, that wait for an approval", () => {
	const tasks = [task("parent"), task("idle-child", "parent"), task("waiting-child", "parent", 1), task("waiting-grandchild", "idle-child", 2), task("other", "elsewhere", 1), task("archived", "parent", 1, true)];
	expect(waitingDescendants(tasks, "parent").map(value => value.id)).toEqual(["waiting-child", "waiting-grandchild"]);
	expect(waitingDescendants(tasks, "other")).toEqual([]);
});
