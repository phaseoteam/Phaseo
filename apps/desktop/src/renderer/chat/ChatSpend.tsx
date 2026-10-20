import { useMemo } from "react";
import { formatCost } from "../../shared/usageAmounts";
import { useWorkspace } from "../app/workspace";
import { chatSpend } from "../lib/chatSpend";

const tokens = new Intl.NumberFormat(undefined, { notation: "compact" });

/** The running total under a chat's composer: what it has used through Phaseo, with its agents. */
export function ChatSpend({ taskId }: { taskId: string }) {
	const { overview } = useWorkspace();
	const { own, agents } = useMemo(() => chatSpend(overview.tasks, taskId), [overview.tasks, taskId]);
	const costNanos = (own?.costNanos ?? 0) + agents.costNanos, total = (own?.tokens ?? 0) + agents.tokens;
	if (!costNanos && !total) return null;
	return <p title="What this chat has used through Phaseo, as the gateway priced each request. Your usage log on the web is the billed record." className="mt-2 px-2 text-right text-xs text-muted-foreground tabular-nums">
		<span className="font-medium text-foreground">{formatCost(costNanos)}</span> · {tokens.format(total)} tokens
		{agents.costNanos + agents.tokens > 0 && `, including ${formatCost(agents.costNanos)} from ${agents.count} agent${agents.count === 1 ? "" : "s"}`}
	</p>;
}
