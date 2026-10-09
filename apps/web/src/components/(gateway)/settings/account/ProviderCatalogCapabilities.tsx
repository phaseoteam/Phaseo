"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { endpointToCapability } from "@/lib/config/capabilityToEndpoints";
import type { ProviderManagedCatalogModel } from "@/app/(dashboard)/settings/account/providers/actions";

type Capabilities = ProviderManagedCatalogModel["capabilities"];

export default function ProviderCatalogCapabilities({ value, options, disabled, label, onChange }: {
	value: Capabilities; options: Record<string, string[]>; disabled: boolean; label: string; onChange: (value: Capabilities) => void;
}) {
	const prefix = useId();
	const ids = Array.from(new Set([...Object.keys(options), ...value.map((item) => item.id)])).sort();
	return <div role="group" aria-label={label} className="space-y-3">{ids.map((id, index) => {
		const selected = value.find((item) => item.id === id);
		const canonicalId = endpointToCapability[`/${id.replaceAll(".", "/")}`] ?? id;
		const parameters = Array.from(new Set([...(options[canonicalId] ?? []), ...(selected?.parameters ?? [])])).sort();
		const controlId = `${prefix}-capability-${index}`;
		return <div key={id} className="rounded-lg border p-3">
			<div className="flex items-center gap-2"><Checkbox id={controlId} checked={Boolean(selected)} disabled={disabled} onCheckedChange={(checked) => onChange(checked ? [...value, { id, parameters: [] }] : value.filter((item) => item.id !== id))} /><Label htmlFor={controlId}><code>{id}</code></Label></div>
			{selected && parameters.length > 0 ? <div className="mt-3 grid gap-3 pl-6 sm:grid-cols-2 lg:grid-cols-3">{parameters.map((parameter, parameterIndex) => {
				const parameterId = `${controlId}-parameter-${parameterIndex}`;
				return <div key={parameter} className="flex items-center gap-2"><Checkbox id={parameterId} checked={selected.parameters.includes(parameter)} disabled={disabled} onCheckedChange={(checked) => onChange(value.map((item) => item.id === id ? { ...item, parameters: checked ? [...item.parameters, parameter] : item.parameters.filter((key) => key !== parameter) } : item))} /><Label htmlFor={parameterId} className="break-all text-xs"><code>{parameter}</code></Label></div>;
			})}</div> : null}
		</div>;
	})}</div>;
}
