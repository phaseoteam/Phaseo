"use client";

import { useId } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";

export function PricingChoice({ label, value, options, onChange, disabled = false }: {
	label: string; value: string; options: Array<{ value: string; label: string; disabled?: boolean }>;
	onChange: (value: string) => void; disabled?: boolean;
}) {
	const id = useId();
	const choices = options.some((option) => option.value === value) || !value ? options : [{ value, label: value }, ...options];
	if (choices.length > 6) return <div className="min-w-0 space-y-2"><Label htmlFor={id}>{label}</Label><SearchableSelect id={id} label={label} value={value} options={choices} onValueChange={onChange} disabled={disabled} /></div>;
	return <div className="min-w-0 space-y-2"><Label htmlFor={id}>{label}</Label>
		<Select value={value} onValueChange={onChange} disabled={disabled}>
			<SelectTrigger id={id} className="min-h-11 w-full"><SelectValue>{choices.find((option) => option.value === value)?.label ?? "Select…"}</SelectValue></SelectTrigger>
			<SelectContent>{choices.map((option) => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectContent>
		</Select>
	</div>;
}

export function PricingDate({ label, value, onChange, optional = false }: {
	label: string; value: string; onChange: (value: string) => void; optional?: boolean;
}) {
	return <div className="space-y-2"><Label>{label}</Label><div className="flex gap-2">
		<DatePickerInput className="min-h-11 min-w-0 flex-1" value={value.slice(0, 10)} placeholder="No end date" onChange={(date) => onChange(date ? `${date}T${value.slice(11, 16) || "00:00"}` : "")} />
		<Input aria-label={`${label} time`} type="time" className="min-h-11 w-28" value={value.slice(11, 16)} disabled={!value} onChange={(event) => onChange(`${value.slice(0, 10)}T${event.target.value}`)} />
		{optional && value ? <Button variant="ghost" onClick={() => onChange("")} aria-label="Clear end date">Clear</Button> : null}
	</div></div>;
}
