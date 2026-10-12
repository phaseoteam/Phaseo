import { Combobox } from "@base-ui/react/combobox";
import { Clock, Search } from "lucide-react";
import type { BrowserRecent } from "../lib/browserHistory";
import { browserNavigationAddress } from "../lib/browserHistory";
import { ScrollArea } from "./ScrollArea";
type AddressItem = { value: string; label: string; recent: boolean };

export function BrowserAddress({ value, onChange, navigate, recents, suggestions }: { value: string; onChange: (value: string) => void; navigate: (url: string) => void; recents: BrowserRecent[]; suggestions: boolean }) {
	const query = value.trim().toLowerCase();
	const items = suggestions ? recents.filter(item => `${item.url} ${item.title}`.toLowerCase().includes(query)).slice(0, 8).map(item => ({ value: item.url, label: item.title, recent: true })) : [];
	if (suggestions && value.trim()) {
		try { const url = browserNavigationAddress(value); if (!items.some(item => item.value === url)) items.push({ value: url, label: url.startsWith("https://www.google.com/search?") ? `Search for ${value.trim()}` : value.trim(), recent: false }); } catch { /* Invalid addresses are reported on submit. */ }
	}
	return <Combobox.Root<AddressItem> items={items} filter={null} value={null} inputValue={value} onInputValueChange={onChange} onValueChange={item => { if (item) { onChange(item.value); navigate(item.value); } }}>
		<Combobox.Input className="browser-address-input" aria-label="Browser address" placeholder="Search or enter a URL" />
		<Combobox.Portal><Combobox.Positioner className="desktop-select-positioner" sideOffset={4} align="start"><Combobox.Popup className="desktop-select-popup" aria-label="Address suggestions"><ScrollArea><Combobox.List>{item => <Combobox.Item className="desktop-select-item" key={item.value} value={item}><span className="desktop-select-value">{item.recent ? <Clock size={14} /> : <Search size={14} />}{item.label}</span></Combobox.Item>}</Combobox.List></ScrollArea></Combobox.Popup></Combobox.Positioner></Combobox.Portal>
	</Combobox.Root>;
}
