import { TriangleAlert } from "lucide-react";
import { cn } from "../lib/utils";

/** Above the composer when the draft is too long to send, or long for the model. */
export function PromptLengthNotice({ problem }: { problem: { blocking: boolean; message: string } }) {
	return <p role={problem.blocking ? "alert" : "status"} data-prompt-length={problem.blocking ? "blocking" : "warning"} className={cn("mb-2 flex items-start gap-1.5 px-1 text-xs", problem.blocking ? "text-destructive" : "text-warning")}>
		<TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />{problem.message}
	</p>;
}
