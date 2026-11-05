import { FilePen, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Task } from "../../shared/workspace";
import { showToast } from "../components/ui/toast";
import { useCommand } from "../lib/keybindings";
import { cn } from "../lib/utils";

type Permission = NonNullable<Task["permissionMode"]>;
const choices: { id: Permission; label: string; short: string; description: string; Icon: typeof ShieldCheck }[] = [
	{ id: "supervised", label: "Ask first", short: "Ask", description: "Approve commands and file changes before they run.", Icon: ShieldCheck },
	{ id: "accept-edits", label: "Accept edits", short: "Edits", description: "File changes go ahead; commands still ask.", Icon: FilePen },
	{ id: "full-access", label: "Full access", short: "Full", description: "Commands and file changes run without asking.", Icon: ShieldAlert },
];

/** The next permission level, round from Ask first through Full access. */
export const nextPermission = (value: Task["permissionMode"]): Permission => choices[(choices.findIndex(choice => choice.id === (value ?? "supervised")) + 1) % choices.length].id;

/** Ctrl+Shift+A (composer.mode): the next permission level, from anywhere in a Code chat, saying which one it is now. */
export function usePermissionShortcut(value: Task["permissionMode"], onChange: (value: Permission) => void, enabled: boolean) {
	useCommand("composer.mode", () => {
		const next = nextPermission(value), choice = choices.find(entry => entry.id === next)!;
		onChange(next); showToast(next === "full-access" ? "warning" : "info", `Permissions: ${choice.label}`, choice.description);
	}, enabled);
}

/** What a Code chat's agent may do without asking, at the foot of the model picker. */
export function PermissionChoice({ value, onChange }: { value: Task["permissionMode"]; onChange: (value: Permission) => void }) {
	const current = value ?? "supervised";
	return <div role="radiogroup" aria-label="Permissions" className="ml-auto flex shrink-0 items-center gap-0.5 rounded-md bg-muted p-0.5">
		{choices.map(({ id, label, short, description, Icon }) => <button key={id} type="button" role="radio" aria-checked={current === id} aria-label={label} title={`${label}: ${description}`} onClick={() => onChange(id)}
			className={cn("flex h-6 items-center gap-1 rounded-[5px] px-1.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3.5", current === id && "bg-background text-foreground shadow-xs", current === id && id === "full-access" && "text-warning")}>
			<Icon aria-hidden />{short}
		</button>)}
	</div>;
}
