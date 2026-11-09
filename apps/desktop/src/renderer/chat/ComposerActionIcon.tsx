import type { SVGProps } from "react";

export type ComposerAction = "send" | "queue" | "steer" | "save";

/** Only the action's telling stroke traces; the rest of the icon stays legible. */
export function ComposerActionIcon({ action, ...props }: { action: ComposerAction } & SVGProps<SVGSVGElement>) {
	return <svg aria-hidden="true" data-composer-icon={action} className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
		{action === "send" ? <><path d="M12 19V5" /><path data-trace="send" pathLength="1" d="m5 12 7-7 7 7" /></>
			: action === "queue" ? <><path d="M4 6h16M4 12h9M4 18h9" /><path data-trace="queue" pathLength="1" d="M19 14v8m-4-4h8" /></>
				: action === "steer" ? <><path data-trace="steer" pathLength="1" d="M4 19v-6a4 4 0 0 1 4-4h12" /><path d="m14 3 6 6-6 6" /></>
					: <path data-trace="save" pathLength="1" d="m5 12 4 4L19 6" />}
	</svg>;
}
