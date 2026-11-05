import { expect, it } from "vitest";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { chatLineage, lineageSize, type LineageNode } from "./chatLineage";

const chat = (id: string, parentId?: string, createdAt = id) => ({ id, parentId, createdAt, title: id }) as unknown as TaskOverview;
const shape = (node: LineageNode): unknown => node.children.length ? { [node.task.id]: node.children.map(shape) } : node.task.id;

it("shows a chat's whole family from its oldest ancestor, forks oldest first", () => {
	const tasks = [chat("root"), chat("b", "root", "2"), chat("a", "root", "1"), chat("a1", "a", "3"), chat("lonely"), chat("orphan", "deleted")];
	const tree = chatLineage(tasks, "a1")!;
	expect(shape(tree)).toEqual({ root: [{ a: ["a1"] }, "b"] });
	expect(lineageSize(tree)).toBe(4);
	expect(chatLineage(tasks, "root")).toEqual(tree);
	expect(chatLineage(tasks, "lonely")).toBeUndefined();
	expect(chatLineage(tasks, "orphan")).toBeUndefined();
});

it("stops at a loop instead of walking it forever", () => {
	expect(shape(chatLineage([chat("x", "y"), chat("y", "x")], "x")!)).toEqual({ y: ["x"] });
});
