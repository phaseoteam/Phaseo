import { shortcutLabel, shortcutKeys } from "../lib/shortcuts";
import { ArrowLeft, ArrowRight, Command, Moon, Plus, Sun } from "lucide-react";
import type { ProductSurface, ThemePreference } from "../types";

type TopbarProps = {
	surface: ProductSurface;
	theme: ThemePreference;
	onThemeChange: (theme: ThemePreference) => void;
	onNewTask: () => void;
	onCommands: () => void;
};

export function Topbar({ surface, theme, onThemeChange, onNewTask, onCommands }: TopbarProps) {
	return (
		<header className="topbar">
			<div className="history-controls">
				<button type="button" aria-label="Back" disabled>
					<ArrowLeft size={15} />
				</button>
				<button type="button" aria-label="Forward" disabled>
					<ArrowRight size={15} />
				</button>
			</div>

			<div className="topbar-context">
				<span>Phaseo</span>
				<span className="breadcrumb-separator">/</span>
				<strong>{surface === "workspace" ? "Workspace" : "Platform"}</strong>
			</div>

			<div className="topbar-actions">
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
					New task
				</button>
			</div>
		</header>
	);
}
