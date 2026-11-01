import { useState, type ComponentProps, type ReactNode } from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { ChevronUp, Ellipsis, Lock, PencilLine, PencilRuler, ShieldOff, type LucideIcon } from "lucide-react";
import type { Task } from "../../shared/workspace";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Tip } from "../components/ui/tooltip";
import { cn } from "../lib/utils";

export type ControlSize = "sm" | "xs";

/** The message box's quiet controls: no border, a filled background on hover or while their menu is open. */
export function controlClass(size: ControlSize = "sm", className?: string) {
	return cn(
		"relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-transparent outline-none transition-colors hover:bg-muted data-popup-open:bg-muted data-popup-open:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		size === "xs" ? "h-6 gap-1 px-1.5 text-xs font-normal text-foreground/70 hover:text-foreground [&_svg:not([class*='size-'])]:size-3.5" : "h-7 gap-1.5 px-2 text-[13px] font-medium text-foreground/80 hover:text-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
		"aria-pressed:bg-muted aria-pressed:text-foreground",
		className,
	);
}

export function ComposerControl({ size, className, ...props }: ComponentProps<"button"> & { size?: ControlSize }) {
	return <button type="button" {...props} className={controlClass(size, className)} />;
}

export type PermissionMode = NonNullable<Task["permissionMode"]>;
export const permissionModes: { mode: PermissionMode; label: string; description: string; icon: LucideIcon }[] = [
	{ mode: "supervised", label: "Ask first", description: "Approve commands and file changes before they run.", icon: Lock },
	{ mode: "accept-edits", label: "Accept edits", description: "File changes apply without asking; commands still ask first.", icon: PencilLine },
	// An open lock reads like a closed one at this size; a crossed shield does not.
	{ mode: "full-access", label: "Full access", description: "The agent runs commands and edits files without asking.", icon: ShieldOff },
];
export const permissionMode = (value: Task["permissionMode"]) => permissionModes.find(option => option.mode === (value ?? "supervised")) ?? permissionModes[0];

/**
 * The permission modes as one row of icons with the shown mode named under it. Each segment is a real menu radio item,
 * so arrow keys reach it from the rest of the menu and a pick closes the menu.
 */
export function PermissionsSection({ value, onChange }: { value: Task["permissionMode"]; onChange: (value: PermissionMode) => void }) {
	const current = permissionMode(value).mode;
	// Hovering or focusing a mode previews its name and description before it is picked.
	const [preview, setPreview] = useState<PermissionMode>();
	const shown = permissionMode(preview ?? current);
	return <div data-composer-permissions className="grid w-72 gap-1.5 px-2 py-1.5">
		<div className="text-xs font-medium text-muted-foreground">Permissions</div>
		<MenuPrimitive.RadioGroup aria-label="Permissions" value={current} onValueChange={(next: PermissionMode) => { if (next !== current) onChange(next); }}
			// Menus move with Up and Down; this row reads across, so Left and Right move too.
			onKeyDown={event => {
				if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
				const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitemradio]"));
				const next = items[items.indexOf(document.activeElement as HTMLElement) + (event.key === "ArrowRight" ? 1 : -1)];
				if (!next) return;
				event.preventDefault(); event.stopPropagation(); next.focus();
			}}
			className="flex rounded-md bg-muted/70 p-0.5">
			{permissionModes.map(option => <MenuPrimitive.RadioItem key={option.mode} value={option.mode} label={option.label} aria-label={option.label} closeOnClick
				onPointerEnter={() => setPreview(option.mode)} onPointerLeave={() => setPreview(undefined)} onFocus={() => setPreview(option.mode)} onBlur={() => setPreview(undefined)}
				className="flex h-6 flex-1 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none data-checked:bg-background data-checked:text-foreground data-checked:shadow-xs data-highlighted:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
				<option.icon aria-hidden className={cn("size-3.5", option.mode === "full-access" && "in-data-checked:text-warning")} />
			</MenuPrimitive.RadioItem>)}
		</MenuPrimitive.RadioGroup>
		<div aria-hidden className="grid gap-0.5">
			<span className={cn("text-[13px]", shown.mode === current ? "text-foreground" : "text-muted-foreground")}>{shown.label}</span>
			{/* Two lines kept, so the menu does not jump while modes are previewed. */}
			<span className="min-h-8 text-xs leading-4 text-muted-foreground">{shown.description}</span>
		</div>
	</div>;
}

/**
 * The permissions chip beside the model. The model picker's footer always holds Permissions, so in a chat the chip only
 * shows while the mode is not Ask first; `always` keeps it where there is no picker (a side chat).
 */
export function PermissionMenu({ value, onChange, size, always = true }: { value: Task["permissionMode"]; onChange: (value: PermissionMode) => void; size?: ControlSize; always?: boolean }) {
	const current = permissionMode(value);
	if (!always && current.mode === "supervised") return null;
	return <DropdownMenu>
		<Tip label={`Permissions: ${current.label}. ${current.description}`}>
			<DropdownMenuTrigger render={<button type="button" aria-label={`Permissions: ${current.label}`} data-composer-permissions-chip className={controlClass(size, cn("ps-1.5", current.mode === "full-access" && "text-warning hover:text-warning [&_svg]:text-current!"))} />}>
				<current.icon aria-hidden /><span data-composer-control-label>{current.label}</span>
			</DropdownMenuTrigger>
		</Tip>
		<DropdownMenuContent align="start" side="top" sideOffset={8} className="w-auto p-1"><PermissionsSection value={value} onChange={onChange} /></DropdownMenuContent>
	</DropdownMenu>;
}

/** Permissions one menu deeper, in the model picker's footer. */
export function PermissionsFooterMenu({ value, onChange }: { value: Task["permissionMode"]; onChange: (value: PermissionMode) => void }) {
	const current = permissionMode(value);
	return <DropdownMenu>
		<DropdownMenuTrigger render={<button type="button" aria-label={`Permissions: ${current.label}`} data-composer-permissions-trigger className="ml-auto flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-popup-open:bg-muted data-popup-open:text-foreground" />}>
			<current.icon aria-hidden className="size-3.5" />{current.label}<ChevronUp aria-hidden className="size-3" />
		</DropdownMenuTrigger>
		<DropdownMenuContent side="top" align="end" sideOffset={6} className="w-auto p-1"><PermissionsSection value={value} onChange={onChange} /></DropdownMenuContent>
	</DropdownMenu>;
}

/** Shown only while plan mode is on (it is turned on from /); clicking it turns plan mode off. */
export function PlanIndicator({ onClear, size }: { onClear?: () => void; size?: ControlSize }) {
	const label = onClear ? "Plan mode: the agent proposes a plan before changing anything. Click to turn it off." : "Plan mode: the agent proposes a plan before changing anything.";
	return <Tip label={label}><ComposerControl size={size} aria-pressed aria-label={label} disabled={!onClear} onClick={onClear} className="disabled:opacity-100"><PencilRuler aria-hidden className="text-current" /><span data-composer-control-label>Plan</span></ComposerControl></Tip>;
}

/**
 * The controls after the model, as one block that folds into a … menu when the box is narrow. `menu` is what the menu
 * offers in their place.
 */
export function ModeBlock({ children, menu }: { children: ReactNode; menu?: ReactNode }) {
	return <>
		<div data-composer-mode-block className="flex shrink-0 items-center gap-0.5 @max-[30rem]/composer:hidden">{children}</div>
		{menu && <div className="hidden shrink-0 @max-[30rem]/composer:flex">{menu}</div>}
	</>;
}

/** The narrow box's … menu: plan mode and permissions. */
export function ComposerOverflowMenu({ plan, onPlan, permission, onPermission }: { plan?: boolean; onPlan?: (on: boolean) => void; permission?: Task["permissionMode"]; onPermission?: (value: PermissionMode) => void }) {
	if (!onPlan && !onPermission) return null;
	return <DropdownMenu>
		<DropdownMenuTrigger render={<button type="button" aria-label="More message box controls" className={controlClass("sm")} />}><Ellipsis aria-hidden /></DropdownMenuTrigger>
		<DropdownMenuContent align="start" side="top" sideOffset={8} className="w-auto min-w-48 p-1">
			{onPlan && <>
				<DropdownMenuLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Mode</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={plan ? "plan" : "build"} onValueChange={value => onPlan(value === "plan")}>
					<DropdownMenuRadioItem value="build" closeOnClick>Build</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="plan" closeOnClick>Plan</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
				{onPermission && <DropdownMenuSeparator />}
			</>}
			{onPermission && <PermissionsSection value={permission} onChange={onPermission} />}
		</DropdownMenuContent>
	</DropdownMenu>;
}
