import { shortcutLabel, shortcutKeys } from "../lib/shortcuts";
import { PanelRight, MessageSquare, Command, Moon, Plus, Sun } from "lucide-react";
import type { ProductSurface, ThemePreference } from "../types";

type TopbarProps = {
	surface: ProductSurface;
	theme: ThemePreference;
	onThemeChange: (theme: ThemePreference) => void;
	onNewTask: () => void;
	onCommands: () => void;
	onChats: () => void;
	onTools: () => void;
};

export function Topbar({ surface, theme, onThemeChange, onNewTask, onCommands, onChats, onTools }: TopbarProps) {
	return (
		<header className="topbar">
			<button type="button" className="icon-button" aria-label="Chats" onClick={onChats}><MessageSquare size={16} /></button>

			<div className="topbar-context">
				<span>Phaseo</span>
				<span className="breadcrumb-separator">/</span>
				<strong>{surface === "workspace" ? "Chats" : "Platform"}</strong>
			</div>

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
