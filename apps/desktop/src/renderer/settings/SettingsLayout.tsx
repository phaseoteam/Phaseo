import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/** A settings page: a centred column with a large title, sections below. */
export function SettingsPageLayout({ title, description, actions, children, wide, className }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean; className?: string }) {
	return <div className={cn("mx-auto flex w-full flex-col gap-9 px-8 pt-12 pb-16", wide ? "max-w-[880px]" : "max-w-[760px]", className)}>
		<header className="flex items-end gap-4">
			<div className="min-w-0 flex-1">
				<h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
				{description && <p className="mt-1.5 text-[13px] text-muted-foreground">{description}</p>}
			</div>
			{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
		</header>
		{children}
	</div>;
}

/** A titled group of settings rows in one rounded card. */
export function SettingsSection({ title, description, action, children, className, label }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; label?: string }) {
	return <section aria-label={label ?? title} className={cn("flex flex-col gap-2.5", className)}>
		<div className="flex items-end gap-3 px-0.5">
			<div className="min-w-0 flex-1">
				<h2 className="text-[13.5px] font-bold">{title}</h2>
				{description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
			</div>
			{action}
		</div>
		<div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/60">{children}</div>
	</section>;
}

/** One setting: what it is on the left, its control on the right. Extra content (details, forms) goes below. */
export function SettingsRow({ title, description, control, children, icon, className }: { title: ReactNode; description?: ReactNode; control?: ReactNode; children?: ReactNode; icon?: ReactNode; className?: string }) {
	return <div className={cn("flex flex-col gap-3 px-4 py-3.5", className)}>
		<div className="flex items-center gap-4">
			{icon && <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted [&_img]:size-4.5 [&_svg]:size-4.5 [&_.harness-logo]:size-4.5">{icon}</span>}
			<div className="min-w-0 flex-1">
				<div className="text-[13px] font-semibold">{title}</div>
				{description && <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</div>}
			</div>
			{control && <div className="flex shrink-0 items-center gap-2">{control}</div>}
		</div>
		{children}
	</div>;
}

/** A small secondary button for settings rows. */
export function SettingsButton({ children, onClick, disabled, variant = "outline", type = "button", title }: { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "outline" | "primary" | "ghost" | "danger"; type?: "button" | "submit"; title?: string }) {
	return <button type={type} title={title} disabled={disabled} onClick={onClick} className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5",
		variant === "primary" ? "bg-primary text-primary-foreground hover:bg-primary/85" : variant === "danger" ? "text-destructive hover:bg-destructive/10" : variant === "ghost" ? "text-muted-foreground hover:bg-muted hover:text-foreground" : "border border-border bg-background/40 hover:bg-muted")}>{children}</button>;
}

/** A text field styled for settings forms. */
export function SettingsField({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
	return <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
		{label}
		{children}
		{hint && <span className="font-normal">{hint}</span>}
	</label>;
}
export const settingsInput = "h-8 w-full rounded-lg border border-input bg-background/40 px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-50";

/** Status and error lines inside a section. */
export function SettingsNote({ children, tone = "muted", role, className }: { children: ReactNode; tone?: "muted" | "error"; role?: "status" | "alert"; className?: string }) {
	return <p role={role} className={cn("px-4 py-2.5 text-xs", tone === "error" ? "text-destructive" : "text-muted-foreground", className)}>{children}</p>;
}
