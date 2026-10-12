import { shortcutLabel, shortcutKeys } from "../lib/shortcuts";
import { ArrowLeft, ArrowRight, PanelLeft, PanelRight, Command, Moon, Plus, Sun } from "lucide-react";
import type { ProductSurface, ThemePreference } from "../types";
import { Select } from "./Select";

type TopbarProps = {
	surface: ProductSurface;
	theme: ThemePreference;
	onThemeChange: (theme: ThemePreference) => void;
	onNewTask: () => void;
	onCommands: () => void;
	onChats: () => void;
	onTools: () => void;
	onSurfaceChange: (surface: ProductSurface) => void;
	onBack: () => void;
	onForward: () => void;
	canBack: boolean;
	canForward: boolean;
};

export function Topbar({ surface, theme, onThemeChange, onNewTask, onCommands, onChats, onTools, onSurfaceChange, onBack, onForward, canBack, canForward }: TopbarProps) {
	return (
		<header className="topbar">
			<div className="topbar-navigation"><button type="button" className="icon-button" aria-label="Go back" disabled={!canBack} onClick={onBack}><ArrowLeft size={16} /></button><button type="button" className="icon-button" aria-label="Go forward" disabled={!canForward} onClick={onForward}><ArrowRight size={16} /></button><button type="button" className="icon-button" aria-label="Toggle sidebar" onClick={onChats}><PanelLeft size={16} /></button></div>

			<div className="topbar-surface"><Select label="Product" value={surface} onValueChange={value => onSurfaceChange(value as ProductSurface)} options={[{ value: "workspace", label: "Chat" }, { value: "platform", label: "Platform" }]} /></div>

			<div className="topbar-actions">
				{surface === "workspace" && <button type="button" className="command-button" onClick={onTools}><PanelRight size={15} />Tools</button>}
				<button className="command-button" type="button" aria-keyshortcuts={shortcutKeys("K")} onClick={onCommands}>
					<Command size={14} />
					<span>Commands</span>
					<kbd>{shortcutLabel("K")}</kbd>
				</button>
				<button
					className="icon-button"
					type="button"
					onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
					aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
				>
					{theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
				</button>
				<button className="primary-button compact" type="button" onClick={onNewTask}>
					<Plus size={15} />
					New chat
				</button>
			</div>
		</header>
	);
}
