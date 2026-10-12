import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, CalendarClock, Link2, Palette, Search, Settings2, Users } from "lucide-react";
import { ScrollArea } from "./ScrollArea";

const sections = [
	{ id: "settings", label: "General", icon: Settings2 },
	{ id: "appearance", label: "Appearance", icon: Palette },
	{ id: "accounts", label: "Accounts", icon: Users },
	{ id: "agents", label: "Agents", icon: Bot },
	{ id: "mcp", label: "MCP connections", icon: Link2 },
	{ id: "missions", label: "Schedules", icon: CalendarClock },
];

export function SettingsNavigation({ active, onSelect, onBack }: { active: string; onSelect: (id: string) => void; onBack: () => void }) {
	const [query, setQuery] = useState("");
	const back = useRef<HTMLButtonElement>(null);
	useEffect(() => { back.current?.focus(); }, []);
	const matches = sections.filter(section => section.label.toLowerCase().includes(query.trim().toLowerCase()));
	return <aside className="settings-navigation" aria-label="Settings navigation">
		<button ref={back} className="settings-back" type="button" aria-label="Back to chat" onClick={onBack}><ArrowLeft size={16} />Back to chat</button>
		<label className="task-search"><Search size={14} /><input aria-label="Search settings" placeholder="Search settings" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} /></label>
		<ScrollArea className="settings-navigation-scroll"><nav aria-label="Settings sections">{matches.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={id === active ? "page" : undefined} onClick={() => onSelect(id)}><Icon size={16} /><span>{label}</span></button>)}{!matches.length && <p role="status" className="task-muted">No matching sections.</p>}</nav></ScrollArea>
	</aside>;
}
