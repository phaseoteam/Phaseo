import type { DynamicRouteEdge, DynamicRouteNode } from "@/lib/fetchers/internal/settingsTypes";

export function orderedRouteNodes(nodes: DynamicRouteNode[], edges: DynamicRouteEdge[], entryNodeId?: string | null): DynamicRouteNode[] {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const ordered: DynamicRouteNode[] = [];
	const queue = [entryNodeId ?? nodes.find((node) => node.type === "start")?.id].filter((id): id is string => Boolean(id));
	const seen = new Set<string>();
	while (queue.length) {
		const id = queue.shift()!;
		if (seen.has(id)) continue;
		seen.add(id);
		const node = byId.get(id);
		if (node) ordered.push(node);
		for (const edge of edges) if (edge.source === id) queue.push(edge.target);
	}
	for (const node of nodes) if (!seen.has(node.id)) ordered.push(node);
	return ordered;
}

export function branchLabel(handle: string | null | undefined): string {
	if (handle === "true") return "True";
	if (handle === "false") return "False";
	if (handle === "within") return "Within limit";
	if (handle === "exceeded") return "Exceeded";
	return handle ? handle.replaceAll("_", " ") : "Next";
}
