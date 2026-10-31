import { CircleCheck, CircleDot, type LucideIcon } from "lucide-react";

export type IssueStatePresentation = { label: string; toneClassName: string; Icon: LucideIcon };
/** How an issue's state reads wherever it appears, in the same tones as pull requests. */
export const ISSUE_STATE_PRESENTATION: Record<"open" | "closed", IssueStatePresentation> = {
	open: { label: "Open", toneClassName: "text-emerald-600 dark:text-emerald-300/90", Icon: CircleDot },
	closed: { label: "Closed", toneClassName: "text-violet-600 dark:text-violet-300/90", Icon: CircleCheck },
};
export function issueStatePresentation(state: "open" | "closed"): IssueStatePresentation { return ISSUE_STATE_PRESENTATION[state]; }
