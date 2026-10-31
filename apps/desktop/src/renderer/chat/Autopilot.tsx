import { useEffect, useState } from "react";
import { ChevronDown, Plane } from "lucide-react";
import { autopilotCap } from "../../shared/workspace";
import { formatSpend } from "../../shared/usageAmounts";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Checkbox } from "../components/ui/checkbox";
import { SettingsButton, settingsInput } from "../settings/SettingsLayout";
import { cn } from "../lib/utils";

export type AutopilotSetting = { capNanos: number | null };
const toNanos = (dollars: number) => Math.round(dollars * 1e9);

/**
 * Turning Autopilot on (experimental): what it does, and the spend cap for the chat and its agents. Shown only when
 * Autopilot is allowed in Settings → Experimental.
 */
export function AutopilotDialog({ open, onOpenChange, value, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; value?: AutopilotSetting; onConfirm: (value: AutopilotSetting) => void }) {
	const [dollars, setDollars] = useState("5");
	const [uncapped, setUncapped] = useState(false);
	useEffect(() => { if (!open) return; setUncapped(value?.capNanos === null); setDollars(value?.capNanos ? String(value.capNanos / 1e9) : "5"); }, [open, value?.capNanos]);
	const amount = Number(dollars), cap = toNanos(amount);
	const valid = uncapped || (dollars.trim() !== "" && Number.isFinite(amount) && cap >= autopilotCap.minimumNanos && cap <= autopilotCap.maximumNanos);
	return <Dialog open={open} onOpenChange={onOpenChange}>
		<DialogContent className="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>{value ? "Autopilot spend cap" : "Turn on Autopilot"}</DialogTitle>
				<DialogDescription>Very experimental. Expect rough edges, and check what it did.</DialogDescription>
			</DialogHeader>
			{!value && <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px] text-muted-foreground">
				<li>The chat runs with Full access: the agent runs commands and edits files without asking.</li>
				<li>A model answers the agent&apos;s questions, forms and plans for you.</li>
				<li>When a turn ends, a model checks the work and sends the next instruction, until it judges the task done or needs you.</li>
				<li>Agents this chat starts run in Autopilot too, and count towards its cap. Autopilot&apos;s own model calls are billed to the chat.</li>
			</ul>}
			<div className="flex flex-col gap-2">
				<label className="flex items-center gap-2 text-[13px] font-medium">
					<span className="w-24 shrink-0">Spend cap</span>
					<span className="relative flex-1">
						<span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground">$</span>
						<input type="number" inputMode="decimal" min={0.01} max={10000} step={0.5} aria-label="Spend cap in dollars" disabled={uncapped} value={dollars} onChange={event => setDollars(event.target.value)} className={cn(settingsInput, "h-9 pl-6 tabular-nums")} />
					</span>
				</label>
				<label className="flex items-center gap-2 pl-26 text-[13px] text-muted-foreground"><Checkbox checked={uncapped} onCheckedChange={checked => setUncapped(Boolean(checked))} aria-label="No cap" />No cap</label>
				<p className="text-xs text-muted-foreground">Counts Phaseo spend by this chat and its agents. At the cap, Autopilot stops them and hands the chat back. Claude and Codex subscription usage isn&apos;t counted.</p>
			</div>
			<DialogFooter>
				<SettingsButton variant="ghost" onClick={() => onOpenChange(false)}>Cancel</SettingsButton>
				<SettingsButton variant="primary" disabled={!valid} onClick={() => { onConfirm({ capNanos: uncapped ? null : cap }); onOpenChange(false); }}>{value ? "Save cap" : "Turn on Autopilot"}</SettingsButton>
			</DialogFooter>
		</DialogContent>
	</Dialog>;
}

/** The composer's Autopilot switch: off, it opens the dialog; on, it shows the cap with ways to change it or turn it off. */
export function AutopilotControl({ value, onChange, disabled, disabledReason }: { value?: AutopilotSetting; onChange: (value: AutopilotSetting | null) => void; disabled?: boolean; disabledReason?: string }) {
	const [dialog, setDialog] = useState(false);
	const button = "flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium hover:bg-muted disabled:opacity-50 [&_svg]:size-4";
	return <>
		{value
			? <DropdownMenu>
				<DropdownMenuTrigger render={<button type="button" title="Autopilot is on (experimental)" className={cn(button, "text-warning")} />}>
					<Plane />Autopilot{value.capNanos !== null && <span className="text-muted-foreground tabular-nums">· {formatSpend(value.capNanos)} cap</span>}<ChevronDown className="size-3!" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" side="top" className="w-56">
					<DropdownMenuItem onClick={() => setDialog(true)}>Change spend cap…</DropdownMenuItem>
					<DropdownMenuItem onClick={() => onChange(null)}>Turn off Autopilot</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			: <button type="button" disabled={disabled} title={disabled ? disabledReason : "Autopilot (experimental): models answer the agent and keep it going until the task is done"} onClick={() => setDialog(true)} className={cn(button, "text-muted-foreground hover:text-foreground")}><Plane />Autopilot</button>}
		<AutopilotDialog open={dialog} onOpenChange={setDialog} value={value} onConfirm={onChange} />
	</>;
}
