import { Select as Primitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { ScrollArea } from "./ScrollArea";

type Option = { value: string; label: string; disabled?: boolean };
// The website's shadcn Select uses Base UI, including a portalled popup.
export function Select({ value, onValueChange, options, disabled, label }: { value: string; onValueChange: (value: string) => void; options: Option[]; disabled?: boolean; label: string }) {
	return <Primitive.Root value={value} onValueChange={next => { if (next !== null) onValueChange(next); }} disabled={disabled} items={options.map(option => ({ value: option.value, label: option.label }))}>
		<Primitive.Trigger data-slot="select-trigger" className="desktop-select-trigger" aria-label={label}><Primitive.Value data-slot="select-value" /><Primitive.Icon><ChevronDown size={16} /></Primitive.Icon></Primitive.Trigger>
		<Primitive.Portal><Primitive.Positioner sideOffset={4} align="start" alignItemWithTrigger={false} className="desktop-select-positioner"><Primitive.Popup data-slot="select-content" aria-label={`${label} options`} className="desktop-select-popup"><ScrollArea><Primitive.List>{options.map(option => <Primitive.Item data-slot="select-item" className="desktop-select-item" value={option.value} disabled={option.disabled} key={option.value}><Primitive.ItemText>{option.label}</Primitive.ItemText><Primitive.ItemIndicator><Check size={14} /></Primitive.ItemIndicator></Primitive.Item>)}</Primitive.List></ScrollArea></Primitive.Popup></Primitive.Positioner></Primitive.Portal>
	</Primitive.Root>;
}
