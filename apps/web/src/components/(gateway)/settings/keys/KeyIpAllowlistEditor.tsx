"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type KeyIpEntry = { label: string; address: string };

export function KeyIpAllowlistEditor({ entries, onChange, disabled }: {
    entries: KeyIpEntry[];
    onChange: (entries: KeyIpEntry[]) => void;
    disabled: boolean;
}) {
    function update(index: number, field: keyof KeyIpEntry, value: string) {
        onChange(entries.map((entry, i) => i === index ? { ...entry, [field]: value } : entry));
    }
    return (
        <section className="space-y-4" aria-label="Allowed IPs">
            <div>
                <div className="text-sm font-medium">Allowed IPs</div>
                <p className="text-xs text-muted-foreground">An empty list allows requests from anywhere. Otherwise, only these addresses and ranges can use this key.</p>
            </div>
            {entries.map((entry, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
                    <div className="space-y-2">
                        <Label htmlFor={`ip-label-${index}`}>Label</Label>
                        <Input id={`ip-label-${index}`} value={entry.label} maxLength={100} required disabled={disabled} placeholder="Production servers" onChange={(event) => update(index, "label", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`ip-address-${index}`}>IP address or CIDR</Label>
                        <Input id={`ip-address-${index}`} value={entry.address} required disabled={disabled} placeholder="203.0.113.0/24" onChange={(event) => update(index, "address", event.target.value)} />
                    </div>
                    <Button type="button" variant="ghost" disabled={disabled} aria-label={`Remove IP entry ${index + 1}`} onClick={() => onChange(entries.filter((_, i) => i !== index))}>Remove</Button>
                </div>
            ))}
            <Button type="button" variant="outline" disabled={disabled || entries.length >= 100} onClick={() => onChange([...entries, { label: "", address: "" }])}>Add IP address</Button>
        </section>
    );
}
