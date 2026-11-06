import { useState } from "react";
import { Radio } from "lucide-react";
import type { Task } from "../../shared/workspace";
import type { AppCommandId } from "../../shared/appCommands";
import { errorText } from "../app/workspace";
import { Callout } from "../components/ui/callout";
import { showToast } from "../components/ui/toast";
import { runAppCommand } from "../lib/appCommands";

/** Under the operator chat: what it is subscribed to and, when paused, why, with the kill switch and the way back. */
export function OperatorNotice({ task }: { task: Task }) {
	const [busy, setBusy] = useState(false);
	const state = task.operator;
	if (!state || task.archived) return null;
	const run = (command: AppCommandId) => { setBusy(true); void runAppCommand(command).catch(reason => showToast("error", "Could not change the operator", errorText(reason))).finally(() => setBusy(false)); };
	const button = (label: string, command: AppCommandId) => <button type="button" disabled={busy} onClick={() => run(command)} className="font-medium underline-offset-2 hover:underline disabled:opacity-60">{label}</button>;
	const subscriptions = state.subscriptions.length, held = state.held.length;
	if (state.paused) return <Callout tone="warning" role="status" title="Operator paused">
		<p>{state.paused.summary}{held ? ` ${held} ${held === 1 ? "event is" : "events are"} held.` : ""}</p>
		<p className="mt-1 flex gap-3">{state.paused.reason === "cap" && button("Raise the cap by $5", "operator.raiseCap")}{button("Resume", "operator.resume")}</p>
	</Callout>;
	return <Callout tone="info" icon={Radio} title="Operator">
		<p>{subscriptions ? `Watching ${subscriptions} ${subscriptions === 1 ? "subscription" : "subscriptions"}.` : "No subscriptions yet. Ask it what to watch."}{held ? ` ${held} ${held === 1 ? "event waits" : "events wait"} for its next wake.` : ""} It can open pages, read and message your chats, and run agents.</p>
		<p className="mt-1">{button("Pause", "operator.pause")}</p>
	</Callout>;
}
