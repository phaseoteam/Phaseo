import { useEffect, useState } from "react";
import type { QuitHoldState } from "../../shared/desktop";
import { isMac } from "../lib/shortcuts";

/** While the quit shortcut is held (Settings → Chat → Quitting → Hold), a bar at the top fills until Phaseo quits. */
export function QuitHoldNotice() {
	const [hold, setHold] = useState<QuitHoldState>();
	useEffect(() => window.phaseoDesktop?.onQuitHold?.(state => setHold(state.state === "cancelled" ? undefined : state)), []);
	if (!hold) return null;
	const shortcut = isMac() ? "⌘Q" : "Ctrl+Q";
	return <div role="status" className="pointer-events-none fixed inset-x-0 top-12 z-[100] flex justify-center">
		<div className="w-64 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
			<p className="px-3 pt-2 pb-1.5 text-center text-[13px]">{hold.state === "quitting" ? "Quitting Phaseo…" : `Keep holding ${shortcut} to quit`}</p>
			<div className="h-1 bg-muted">
				<div className="h-full bg-primary" style={hold.state === "holding" ? { animation: `quit-hold ${hold.ms}ms linear forwards` } : { width: "100%" }} />
			</div>
		</div>
	</div>;
}
