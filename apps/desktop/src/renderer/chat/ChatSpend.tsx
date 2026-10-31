import { useMemo } from "react";
import { formatRoundedCount } from "@phaseo/app-kit/format";
import { formatCost, formatSpend } from "../../shared/usageAmounts";
import { useWorkspace } from "../app/workspace";
import { chatSpend } from "../../shared/chatSpend";

/** The running total under a chat's composer: what it has used through Phaseo, with its agents. */
export function ChatSpend({ taskId }: { taskId: string }) {
	const { overview } = useWorkspace();
	const { own, agents } = useMemo(() => chatSpend(overview.tasks, taskId), [overview.tasks, taskId]);
	const costNanos = (own?.costNanos ?? 0) + agents.costNanos, total = (own?.tokens ?? 0) + agents.tokens;
	// A chat that set an Autopilot cap shows how close it is; its agents show their parent's.
	const autopilot = overview.tasks.find(task => task.id === taskId)?.autopilot, cap = autopilot && !autopilot.inherited ? autopilot.capNanos : null;
	if (!costNanos && !total && cap === null) return null;
	return <p title="What this chat has used through Phaseo, as the gateway priced each request. Your usage log on the web is the billed record." className="mt-2 px-2 text-right text-xs text-muted-foreground tabular-nums">
		<span className="font-medium text-foreground">{formatCost(costNanos)}</span>{cap !== null && ` of ${formatSpend(cap)} cap`} · {formatRoundedCount(total, "en-US")} tokens
		{agents.costNanos + agents.tokens > 0 && `, including ${formatCost(agents.costNanos)} from ${agents.count} agent${agents.count === 1 ? "" : "s"}`}
	</p>;
}
