"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type KeyIpEntry = { label: string; address: string };

export function KeyIpAllowlistEditor({ entries, onChange, disabled }: {
    entries: KeyIpEntry[];
    onChange: (entries: KeyIpEntry[]) => void;
    disabled: boolean;
}) {
    const t = useTranslations("SettingsUI");
    function update(index: number, field: keyof KeyIpEntry, value: string) {
        onChange(entries.map((entry, i) => i === index ? { ...entry, [field]: value } : entry));
    }
    return (
        <section className="space-y-4" aria-label={t("keyDetail.allowedIps")}>
            <div>
                <div className="text-sm font-medium">{t("keyDetail.allowedIps")}</div>
                <p className="text-xs text-muted-foreground">{t("keyDetail.ipHelp")}</p>
            </div>
            {entries.map((entry, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
                    <div className="space-y-2">
                        <Label htmlFor={`ip-label-${index}`}>{t("strings.Label")}</Label>
                        <Input id={`ip-label-${index}`} value={entry.label} maxLength={100} required disabled={disabled} placeholder={t("keyDetail.serverPlaceholder")} onChange={(event) => update(index, "label", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`ip-address-${index}`}>{t("keyDetail.addressOrCidr")}</Label>
                        <Input id={`ip-address-${index}`} value={entry.address} required disabled={disabled} placeholder="203.0.113.0/24" onChange={(event) => update(index, "address", event.target.value)} />
                    </div>
                    <Button type="button" variant="ghost" disabled={disabled} aria-label={t("keyDetail.removeEntry", { number: index + 1 })} onClick={() => onChange(entries.filter((_, i) => i !== index))}>{t("newMainSettingsCopy.remove")}</Button>
                </div>
            ))}
            <Button type="button" variant="outline" disabled={disabled || entries.length >= 100} onClick={() => onChange([...entries, { label: "", address: "" }])}>{t("keyDetail.addIp")}</Button>
        </section>
    );
}
