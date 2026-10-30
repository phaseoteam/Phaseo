import type { DynamicRouteEdge, DynamicRouteNode } from "@/lib/fetchers/internal/settingsTypes";
import { branchLabel, orderedRouteNodes } from "./dynamicRouteGraph";

function node(id: string, type: DynamicRouteNode["type"] = "model"): DynamicRouteNode {
	return { id, type, data: { label: id } };
}

describe("dynamic route graph helpers", () => {
	it("orders nodes from the entry point before preserving disconnected nodes", () => {
		const nodes = [node("orphan"), node("start", "start"), node("branch"), node("model")];
		const edges: DynamicRouteEdge[] = [
			{ id: "start-branch", source: "start", target: "branch" },
			{ id: "branch-model", source: "branch", target: "model", sourceHandle: "true" },
		];

		expect(orderedRouteNodes(nodes, edges, "start").map((item) => item.id)).toEqual(["start", "branch", "model", "orphan"]);
	});

	it("uses readable labels for branch handles", () => {
		expect(branchLabel("true")).toBe("True");
		expect(branchLabel("exceeded")).toBe("Exceeded");
		expect(branchLabel("candidate_branch")).toBe("candidate branch");
		expect(branchLabel(null)).toBe("Next");
	});
});
