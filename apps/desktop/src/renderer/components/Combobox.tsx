import { Combobox as Primitive } from "@base-ui/react/combobox";
import { ScrollArea } from "./ScrollArea";

type Option = { value: string; label: string };

export function Combobox({ label, value, onChange, options, disabled, required, maxLength, minLength, placeholder }: { label: string; value: string; onChange: (value: string) => void; options: Option[]; disabled?: boolean; required?: boolean; maxLength?: number; minLength?: number; placeholder?: string }) {
	const items = options.filter(option => `${option.value} ${option.label}`.toLowerCase().includes(value.toLowerCase())).slice(0, 100);
	return <Primitive.Root<Option> items={items} filter={null} value={null} inputValue={value} onInputValueChange={onChange} onValueChange={item => { if (item) onChange(item.value); }} disabled={disabled}>
		<Primitive.Input aria-label={label} required={required} maxLength={maxLength} minLength={minLength} placeholder={placeholder} autoComplete="off" />
		<Primitive.Portal><Primitive.Positioner className="desktop-select-positioner" sideOffset={4} align="start"><Primitive.Popup className="desktop-select-popup" aria-label={`${label} options`}><ScrollArea><Primitive.List>{item => <Primitive.Item className="desktop-select-item" key={item.value} value={item}>{item.label}</Primitive.Item>}</Primitive.List></ScrollArea></Primitive.Popup></Primitive.Positioner></Primitive.Portal>
	</Primitive.Root>;
}
