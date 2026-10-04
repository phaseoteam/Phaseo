import {
	Activity,
	Bell,
	Boxes,
	Bot,
	CircleDot,
	Code2,
	Compass,
	Gauge,
	GitPullRequest,
	Home,
	MessageSquare,
	PanelLeftClose,
	PanelLeftOpen,
	Route,
	Search,
	Settings,
	Sparkles,
	Workflow,
	Terminal,
} from "lucide-react";
import type { NavigationItem, ProductSurface } from "../types";

const workspaceNavigation: NavigationItem[] = [
	{ id: "home", label: "Home", icon: Home },
	{ id: "tasks", label: "Tasks", icon: MessageSquare },
	{ id: "accounts", label: "Accounts", icon: Compass },
	{ id: "inbox", label: "Inbox", icon: Bell },
	{ id: "missions", label: "Missions", icon: CircleDot },
	{ id: "projects", label: "Projects", icon: Workflow },
	{ id: "terminals", label: "Terminals", icon: Terminal },
	{ id: "repositories", label: "Repositories", icon: Code2 },
	{ id: "proposals", label: "Proposals", icon: GitPullRequest },
	{ id: "agents", label: "Agents", icon: Bot },
	{ id: "mcp", label: "MCP", icon: Boxes },
	{ id: "rooms", label: "Rooms", icon: MessageSquare },
];

const platformNavigation: NavigationItem[] = [
	{ id: "overview", label: "Overview", icon: Gauge },
	{ id: "models", label: "Models", icon: Boxes },
	{ id: "providers", label: "Providers", icon: Compass },
	{ id: "gateway", label: "Gateway", icon: Route },
	{ id: "observability", label: "Observability", icon: Activity },
];

type SidebarProps = {
	surface: ProductSurface;
	activeItem: string;
	collapsed: boolean;
	onSurfaceChange: (surface: ProductSurface) => void;
	onItemChange: (item: string) => void;
	onCollapsedChange: (collapsed: boolean) => void;
	onSearch: () => void;
};

export function Sidebar({
	surface,
	activeItem,
	collapsed,
	onSurfaceChange,
	onItemChange,
	onCollapsedChange,
	onSearch,
}: SidebarProps) {
	const navigation = surface === "workspace" ? workspaceNavigation : platformNavigation;

	return (
		<aside className={collapsed ? "sidebar sidebar-collapsed" : "sidebar"}>
			{collapsed ? (
				<button
					className="surface-icon-button"
					type="button"
					onClick={() => onSurfaceChange(surface === "workspace" ? "platform" : "workspace")}
					title={surface === "workspace" ? "Switch to Platform" : "Switch to Workspace"}
				>
					{surface === "workspace" ? <Sparkles size={17} /> : <Boxes size={17} />}
				</button>
			) : (
				<div className="surface-switcher" aria-label="Product surface">
					<button
						className={surface === "workspace" ? "active" : undefined}
						type="button"
						onClick={() => onSurfaceChange("workspace")}
					>
						Workspace
					</button>
					<button
						className={surface === "platform" ? "active" : undefined}
						type="button"
						onClick={() => onSurfaceChange("platform")}
					>
						Platform
					</button>
				</div>
			)}

			{collapsed ? null : (
				<div className="workspace-identity">
					<span className="workspace-avatar">P</span>
					<span>
						<strong>Phaseo</strong>
						<small>Product workspace</small>
					</span>
				</div>
			)}

			<button className="sidebar-search" type="button" title="Search" onClick={onSearch}>
				<Search size={16} />
				{collapsed ? null : (
					<>
						<span>Search</span>
						<kbd>⌘K</kbd>
					</>
				)}
			</button>

			<nav className="sidebar-navigation" aria-label={`${surface} navigation`}>
				{navigation.map((item) => {
					const Icon = item.icon;
					return (
						<button
							key={item.id}
							className={activeItem === item.id ? "sidebar-item active" : "sidebar-item"}
							aria-current={activeItem === item.id ? "page" : undefined}
							type="button"
							onClick={() => onItemChange(item.id)}
							title={collapsed ? item.label : undefined}
						>
							<Icon size={16} strokeWidth={1.8} />
							{collapsed ? null : <span>{item.label}</span>}
							{collapsed || !item.badge ? null : <small>{item.badge}</small>}
						</button>
					);
				})}
			</nav>

			<div className="sidebar-footer">
				<button className={activeItem === "settings" ? "sidebar-item active" : "sidebar-item"} aria-current={activeItem === "settings" ? "page" : undefined} type="button" onClick={() => onItemChange("settings")} title={collapsed ? "Settings" : undefined}>
					<Settings size={16} strokeWidth={1.8} />
					{collapsed ? null : <span>Settings</span>}
				</button>
				<button
					className="sidebar-item"
					type="button"
					onClick={() => onCollapsedChange(!collapsed)}
					title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
				>
					{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
					{collapsed ? null : <span>Collapse</span>}
				</button>
			</div>
		</aside>
	);
}
