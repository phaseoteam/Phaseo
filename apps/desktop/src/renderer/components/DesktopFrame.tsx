import { useEffect, useRef, useState } from "react";
import {
	Check,
	Download,
	ExternalLink,
	Code2,
	Maximize2,
	Minus,
	RefreshCw,
	Square,
	X,
} from "lucide-react";
import type {
	DesktopAppAction,
	DesktopRuntimeInfo,
	DesktopUpdateState,
	DesktopWindowAction,
	DesktopWindowState,
} from "../../shared/desktop";
import type { ThemePreference } from "../types";
import { PhaseoMark } from "./PhaseoMark";

type MenuName = "phaseo" | "file" | "edit" | "view" | "help";

type DesktopFrameProps = {
	theme: ThemePreference;
	onThemeChange: (theme: ThemePreference) => void;
	onNavigate: (destination: "missions" | "projects") => void;
};

const fallbackRuntime: DesktopRuntimeInfo = { platform: "win32", version: "0.1.0", isPackaged: false };
const fallbackWindow: DesktopWindowState = { isFocused: true, isFullScreen: false, isMaximized: false };

function MenuItem({ children, shortcut, disabled, onClick }: {
	children: React.ReactNode;
	shortcut?: string;
	disabled?: boolean;
	onClick?: () => void;
}) {
	return (
		<button className="desktop-menu-item" type="button" role="menuitem" disabled={disabled} onClick={onClick}>
			<span>{children}</span>
			{shortcut && <kbd>{shortcut}</kbd>}
		</button>
	);
}

export function DesktopFrame({ theme, onThemeChange, onNavigate }: DesktopFrameProps) {
	const [activeMenu, setActiveMenu] = useState<MenuName | null>(null);
	const [menuLeft, setMenuLeft] = useState(0);
	const [aboutOpen, setAboutOpen] = useState(false);
	const [preferencesOpen, setPreferencesOpen] = useState(false);
	const [runtime, setRuntime] = useState<DesktopRuntimeInfo>(fallbackRuntime);
	const [windowState, setWindowState] = useState<DesktopWindowState>(fallbackWindow);
	const [update, setUpdate] = useState<DesktopUpdateState>({ status: "unavailable" });
	const rootRef = useRef<HTMLDivElement>(null);
	const api = window.phaseoDesktop;

	useEffect(() => {
		if (!api) return;
		void api.getRuntimeInfo().then(setRuntime);
		void api.getWindowState().then(setWindowState);
		const stopWindow = api.onWindowStateChange(setWindowState);
		const stopUpdate = api.onUpdateStateChange(setUpdate);
		return () => { stopWindow(); stopUpdate(); };
	}, [api]);

	useEffect(() => {
		const close = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setActiveMenu(null);
		};
		const escape = (event: KeyboardEvent) => {
			if (event.key === "Escape") { setActiveMenu(null); setAboutOpen(false); setPreferencesOpen(false); }
		};
		window.addEventListener("pointerdown", close);
		window.addEventListener("keydown", escape);
		return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", escape); };
	}, []);

	useEffect(() => {
		const shortcuts = (event: KeyboardEvent) => {
			if (!(event.ctrlKey || event.metaKey)) return;
			if (event.key === ",") { event.preventDefault(); setPreferencesOpen(true); }
			else if (event.key.toLowerCase() === "n") {
				event.preventDefault();
				onNavigate(event.shiftKey ? "projects" : "missions");
			}
		};
		window.addEventListener("keydown", shortcuts);
		return () => window.removeEventListener("keydown", shortcuts);
	}, [onNavigate]);

	const appAction = (action: DesktopAppAction) => {
		setActiveMenu(null);
		void api?.performAppAction(action);
	};
	const windowAction = (action: DesktopWindowAction) => void api?.performWindowAction(action);
	const openExternal = (url: string) => { setActiveMenu(null); void api?.openExternal(url); };
	const navigate = (destination: "missions" | "projects") => { setActiveMenu(null); onNavigate(destination); };
	const selectMenu = (menu: MenuName, button: HTMLButtonElement) => {
		setMenuLeft(button.getBoundingClientRect().left - (rootRef.current?.getBoundingClientRect().left ?? 0));
		setActiveMenu(current => current === menu ? null : menu);
	};
	const checkForUpdates = async () => {
		setActiveMenu(null);
		setUpdate({ status: "checking" });
		setUpdate(await (api?.checkForUpdates() ?? Promise.resolve({ status: "unsupported" as const })));
	};

	const menu = activeMenu && (
		<div className="desktop-menu" style={{ left: menuLeft }} role="menu">
			{activeMenu === "phaseo" && <>
				<MenuItem onClick={() => { setActiveMenu(null); setAboutOpen(true); }}>About Phaseo</MenuItem>
				<MenuItem onClick={() => { setActiveMenu(null); setPreferencesOpen(true); }} shortcut="Ctrl+,">Preferences</MenuItem>
				<div className="desktop-menu-separator" />
				<MenuItem onClick={checkForUpdates}>Check for updates…</MenuItem>
				<div className="desktop-menu-separator" />
				<MenuItem onClick={() => appAction("quit")} shortcut="Alt+F4">Quit Phaseo</MenuItem>
			</>}
			{activeMenu === "file" && <>
				<MenuItem onClick={() => navigate("missions")} shortcut="Ctrl+N">New mission</MenuItem>
				<MenuItem onClick={() => navigate("projects")} shortcut="Ctrl+Shift+N">New project</MenuItem>
				<div className="desktop-menu-separator" />
				<MenuItem disabled>Open repository…</MenuItem>
			</>}
			{activeMenu === "edit" && <>
				<MenuItem onClick={() => appAction("cut")} shortcut="Ctrl+X">Cut</MenuItem>
				<MenuItem onClick={() => appAction("copy")} shortcut="Ctrl+C">Copy</MenuItem>
				<MenuItem onClick={() => appAction("paste")} shortcut="Ctrl+V">Paste</MenuItem>
				<MenuItem onClick={() => appAction("select-all")} shortcut="Ctrl+A">Select all</MenuItem>
			</>}
			{activeMenu === "view" && <>
				<MenuItem onClick={() => appAction("reload")} shortcut="Ctrl+R">Reload</MenuItem>
				<div className="desktop-menu-separator" />
				<MenuItem onClick={() => appAction("zoom-in")} shortcut="Ctrl++">Zoom in</MenuItem>
				<MenuItem onClick={() => appAction("zoom-out")} shortcut="Ctrl+-">Zoom out</MenuItem>
				<MenuItem onClick={() => appAction("zoom-reset")} shortcut="Ctrl+0">Actual size</MenuItem>
				<div className="desktop-menu-separator" />
				<MenuItem onClick={() => appAction("toggle-full-screen")} shortcut="F11">Full screen</MenuItem>
			</>}
			{activeMenu === "help" && <>
				<MenuItem onClick={() => openExternal("https://docs.phaseo.app")}><ExternalLink size={13} /> Phaseo documentation</MenuItem>
				<MenuItem onClick={() => openExternal("https://github.com/phaseoteam/Phaseo")}><Code2 size={13} /> View source</MenuItem>
				<div className="desktop-menu-separator" />
				<MenuItem onClick={checkForUpdates}>Check for updates…</MenuItem>
			</>}
		</div>
	);

	return (
		<>
			<div ref={rootRef} className={`desktop-frame ${windowState.isFocused ? "is-focused" : "is-blurred"}`}>
				<div className="desktop-frame-brand"><PhaseoMark /><span>Phaseo</span></div>
				<nav className="desktop-menu-bar" aria-label="Application menu">
					{(["phaseo", "file", "edit", "view", "help"] as const).map((name) => (
						<button key={name} type="button" aria-haspopup="menu" aria-expanded={activeMenu === name} className={activeMenu === name ? "active" : ""} onClick={event => selectMenu(name, event.currentTarget)}>
							{name === "phaseo" ? "Phaseo" : name[0].toUpperCase() + name.slice(1)}
						</button>
					))}
				</nav>
				<div className="desktop-frame-drag" />
				{(update.status === "available" || update.status === "ready") && (
					<button className="desktop-update-button" type="button" onClick={update.status === "ready" ? () => void api?.installUpdate() : checkForUpdates}>
						<Download size={13} /> {update.status === "ready" ? "Restart to update" : "Update available"}
					</button>
				)}
				{update.status === "checking" && <span className="desktop-update-status"><RefreshCw size={12} /> Checking…</span>}
				{runtime.platform !== "darwin" && (
					<div className="window-controls">
						<button type="button" aria-label="Minimise" onClick={() => windowAction("minimize")}><Minus size={15} /></button>
						<button type="button" aria-label={windowState.isMaximized ? "Restore" : "Maximise"} onClick={() => windowAction("toggle-maximize")}>
							{windowState.isMaximized ? <Square size={11} /> : <Maximize2 size={13} />}
						</button>
						<button className="window-close" type="button" aria-label="Close" onClick={() => windowAction("close")}><X size={16} /></button>
					</div>
				)}
				{menu}
			</div>

			{aboutOpen && (
				<div className="desktop-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setAboutOpen(false)}>
					<section className="desktop-dialog about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title">
						<button className="dialog-close" type="button" aria-label="Close" onClick={() => setAboutOpen(false)}><X size={15} /></button>
						<div className="about-mark"><PhaseoMark /></div>
						<p className="eyebrow">Desktop workspace</p>
						<h1 id="about-title">Phaseo</h1>
						<p>One place for humans and agents to plan, build and understand software together.</p>
						<div className="about-metadata"><span>Version {runtime.version}</span><span>{runtime.platform}</span><span>{runtime.isPackaged ? "Release build" : "Development build"}</span></div>
						<div className="dialog-actions">
							<button className="secondary-button" type="button" onClick={() => openExternal("https://github.com/phaseoteam/Phaseo")}><Code2 size={14} /> GitHub</button>
							<button className="primary-button" type="button" onClick={checkForUpdates}><RefreshCw size={14} /> Check for updates</button>
						</div>
					</section>
				</div>
			)}

			{preferencesOpen && (
				<div className="desktop-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPreferencesOpen(false)}>
					<section className="desktop-dialog preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="preferences-title">
						<button className="dialog-close" type="button" aria-label="Close" onClick={() => setPreferencesOpen(false)}><X size={15} /></button>
						<p className="eyebrow">Appearance</p><h1 id="preferences-title">Preferences</h1>
						<p className="dialog-description">Choose how Phaseo should look on this device.</p>
						<div className="theme-options">
							{(["system", "light", "dark"] as const).map((option) => (
								<button key={option} type="button" className={theme === option ? "selected" : ""} onClick={() => onThemeChange(option)}>
									<span className={`theme-preview theme-preview-${option}`} />
									<strong>{option[0].toUpperCase() + option.slice(1)}</strong>
									{theme === option && <Check size={14} />}
								</button>
							))}
						</div>
					</section>
				</div>
			)}
		</>
	);
}
