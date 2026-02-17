"use client";

import { useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ChatModelSettings } from "@/lib/indexeddb/chats";

type ModelSettingsDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    settings: ChatModelSettings;
    selectedModelId?: string | null;
    modelChoices?: Array<{
        id: string;
        label: string;
        orgId: string;
        orgName: string;
    }>;
    modelLabel?: string;
    providerOptions: Array<{ id: string; name: string }>;
    supportedProvidersForModel?: string[];
    temperatureValue: number;
    maxTokensValue: number;
    topPValue: number;
    topKValue: number;
    minPValue: number;
    topAValue: number;
    frequencyValue: number;
    presenceValue: number;
    repetitionValue: number;
    onUpdate: (partial: Partial<ChatModelSettings>) => void;
    onUpdateNumber: (key: keyof ChatModelSettings, value: number | null) => void;
    onModelChange?: (modelId: string) => void;
    onReset?: () => void;
    onApplyToAll?: () => void;
    canApplyToAll?: boolean;
};

export function ModelSettingsDialog({
    open,
    onOpenChange,
    settings,
    selectedModelId,
    modelChoices = [],
    modelLabel,
    providerOptions,
    supportedProvidersForModel,
    temperatureValue,
    maxTokensValue,
    topPValue,
    topKValue,
    minPValue,
    topAValue,
    frequencyValue,
    presenceValue,
    repetitionValue,
    onUpdate,
    onUpdateNumber,
    onModelChange,
    onReset,
    onApplyToAll,
    canApplyToAll = false,
}: ModelSettingsDialogProps) {
    const [modelPickerOpen, setModelPickerOpen] = useState(false);
    const filteredProviderOptions = supportedProvidersForModel
        ? providerOptions.filter((provider) =>
              supportedProvidersForModel.includes(provider.id)
          )
        : providerOptions;
    const groupedModelChoices = useMemo(() => {
        const grouped = new Map<string, typeof modelChoices>();
        for (const choice of modelChoices) {
            const key = choice.orgName || "Other";
            const existing = grouped.get(key);
            if (existing) {
                existing.push(choice);
            } else {
                grouped.set(key, [choice]);
            }
        }
        return Array.from(grouped.entries()).sort(([a], [b]) =>
            a.localeCompare(b)
        );
    }, [modelChoices]);
    const selectedChoice =
        modelChoices.find((choice) => choice.id === selectedModelId) ?? null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden p-4">
                <DialogHeader>
                    <DialogTitle>
                        Model settings
                        {modelLabel ? ` - ${modelLabel}` : ""}
                    </DialogTitle>
                    <DialogDescription>
                        Tune how this model responds in this chat.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid max-h-[75vh] gap-3 overflow-y-auto pr-1">
                    <div className="grid gap-2">
                        <div className="flex items-end gap-2">
                            <div className="grid flex-1 gap-1.5">
                                <Label htmlFor="chat-display-name">Chat display name</Label>
                                <Input
                                    id="chat-display-name"
                                    value={settings.displayName ?? ""}
                                    onChange={(event) =>
                                        onUpdate({ displayName: event.target.value })
                                    }
                                    placeholder="Optional model alias for this chat"
                                />
                            </div>
                            <div className="flex items-center gap-2 pb-1">
                                <Label htmlFor="enable-model" className="text-sm">
                                    Enabled
                                </Label>
                                <Switch
                                    id="enable-model"
                                    checked={settings.enabled ?? true}
                                    onCheckedChange={(checked) =>
                                        onUpdate({ enabled: checked })
                                    }
                                />
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Model</Label>
                            <Button
                                type="button"
                                variant="outline"
                                className="justify-start gap-2"
                                disabled={!onModelChange || modelChoices.length === 0}
                                onClick={() => setModelPickerOpen(true)}
                            >
                                {selectedChoice ? (
                                    <>
                                        <Logo
                                            id={selectedChoice.orgId}
                                            alt={selectedChoice.orgName}
                                            width={16}
                                            height={16}
                                            className="shrink-0"
                                        />
                                        <span className="truncate">
                                            {selectedChoice.label}
                                        </span>
                                    </>
                                ) : (
                                    <span className="truncate text-muted-foreground">
                                        {modelLabel ?? "Current model"}
                                    </span>
                                )}
                            </Button>
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Provider</Label>
                            <Select
                                value={settings.providerId ?? "auto"}
                                onValueChange={(value) =>
                                    onUpdate({ providerId: value })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Auto (Gateway)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">
                                        <div className="flex items-center gap-2">
                                            <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                                                <svg
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    className="w-4 h-4"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                >
                                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                                                </svg>
                                            </span>
                                            Auto (Gateway)
                                        </div>
                                    </SelectItem>
                                    {filteredProviderOptions.map((provider) => (
                                        <SelectItem
                                            key={provider.id}
                                            value={provider.id}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Logo
                                                    id={provider.id}
                                                    alt={provider.name}
                                                    width={16}
                                                    height={16}
                                                    className="shrink-0"
                                                />
                                                {provider.name}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <Separator />
                    <div className="grid gap-1.5">
                        <Label htmlFor="system-prompt">System prompt</Label>
                        <Textarea
                            id="system-prompt"
                            value={settings.systemPrompt ?? ""}
                            onChange={(event) =>
                                onUpdate({ systemPrompt: event.target.value })
                            }
                            rows={3}
                        />
                    </div>
                    <div className="grid gap-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium">
                                    Stream responses
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Render answers as they arrive.
                                </p>
                            </div>
                            <Switch
                                checked={settings.stream ?? true}
                                onCheckedChange={(checked) =>
                                    onUpdate({ stream: checked })
                                }
                            />
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value="sampling">
                                <AccordionTrigger>
                                    <span>Sampling parameters</span>
                                    <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                        Coming soon
                                    </span>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="grid gap-2 pt-2">
                                        <p className="text-xs text-muted-foreground">
                                            Sampling controls are not available yet.
                                        </p>
                                        <div className="pointer-events-none opacity-50">
                                        <div className="grid gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <Label htmlFor="temperature">
                                                    Temperature
                                                </Label>
                                                <Input
                                                    id="temperature"
                                                    className="h-8 w-24"
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    max="2"
                                                    value={settings.temperature ?? ""}
                                                    placeholder="0.7"
                                                    onChange={(event) =>
                                                        onUpdateNumber(
                                                            "temperature",
                                                            event.target.value === ""
                                                                ? null
                                                                : Number(event.target.value)
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                value={[temperatureValue]}
                                                min={0}
                                                max={2}
                                                step={0.1}
                                                onValueChange={(value) =>
                                                    onUpdateNumber(
                                                        "temperature",
                                                        value[0]
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <Label htmlFor="max-output">
                                                    Max output tokens
                                                </Label>
                                                <Input
                                                    id="max-output"
                                                    className="h-8 w-24"
                                                    type="number"
                                                    min="1"
                                                    value={settings.maxOutputTokens ?? ""}
                                                    placeholder="800"
                                                    onChange={(event) =>
                                                        onUpdateNumber(
                                                            "maxOutputTokens",
                                                            event.target.value === ""
                                                                ? null
                                                                : Number(event.target.value)
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                value={[maxTokensValue]}
                                                min={1}
                                                max={4096}
                                                step={1}
                                                onValueChange={(value) =>
                                                    onUpdateNumber(
                                                        "maxOutputTokens",
                                                        value[0]
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <Label htmlFor="top-p">Top P</Label>
                                                <Input
                                                    id="top-p"
                                                    className="h-8 w-24"
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    max="1"
                                                    value={settings.topP ?? ""}
                                                    placeholder="1"
                                                    onChange={(event) =>
                                                        onUpdateNumber(
                                                            "topP",
                                                            event.target.value === ""
                                                                ? null
                                                                : Number(event.target.value)
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                value={[topPValue]}
                                                min={0}
                                                max={1}
                                                step={0.01}
                                                onValueChange={(value) =>
                                                    onUpdateNumber("topP", value[0])
                                                }
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <Label htmlFor="top-k">Top K</Label>
                                                <Input
                                                    id="top-k"
                                                    className="h-8 w-24"
                                                    type="number"
                                                    min="1"
                                                    value={settings.topK ?? ""}
                                                    placeholder="40"
                                                    onChange={(event) =>
                                                        onUpdateNumber(
                                                            "topK",
                                                            event.target.value === ""
                                                                ? null
                                                                : Number(event.target.value)
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                value={[topKValue]}
                                                min={1}
                                                max={200}
                                                step={1}
                                                onValueChange={(value) =>
                                                    onUpdateNumber("topK", value[0])
                                                }
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <Label htmlFor="min-p">Min P</Label>
                                                <Input
                                                    id="min-p"
                                                    className="h-8 w-24"
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    max="1"
                                                    value={settings.minP ?? ""}
                                                    placeholder="0"
                                                    onChange={(event) =>
                                                        onUpdateNumber(
                                                            "minP",
                                                            event.target.value === ""
                                                                ? null
                                                                : Number(event.target.value)
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                value={[minPValue]}
                                                min={0}
                                                max={1}
                                                step={0.01}
                                                onValueChange={(value) =>
                                                    onUpdateNumber("minP", value[0])
                                                }
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <Label htmlFor="top-a">Top A</Label>
                                                <Input
                                                    id="top-a"
                                                    className="h-8 w-24"
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    max="1"
                                                    value={settings.topA ?? ""}
                                                    placeholder="0"
                                                    onChange={(event) =>
                                                        onUpdateNumber(
                                                            "topA",
                                                            event.target.value === ""
                                                                ? null
                                                                : Number(event.target.value)
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                value={[topAValue]}
                                                min={0}
                                                max={1}
                                                step={0.01}
                                                onValueChange={(value) =>
                                                    onUpdateNumber("topA", value[0])
                                                }
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <Label htmlFor="frequency">
                                                    Frequency penalty
                                                </Label>
                                                <Input
                                                    id="frequency"
                                                    className="h-8 w-24"
                                                    type="number"
                                                    step="0.1"
                                                    min="-2"
                                                    max="2"
                                                    value={settings.frequencyPenalty ?? ""}
                                                    placeholder="0"
                                                    onChange={(event) =>
                                                        onUpdateNumber(
                                                            "frequencyPenalty",
                                                            event.target.value === ""
                                                                ? null
                                                                : Number(event.target.value)
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                value={[frequencyValue]}
                                                min={-2}
                                                max={2}
                                                step={0.1}
                                                onValueChange={(value) =>
                                                    onUpdateNumber(
                                                        "frequencyPenalty",
                                                        value[0]
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <Label htmlFor="presence">
                                                    Presence penalty
                                                </Label>
                                                <Input
                                                    id="presence"
                                                    className="h-8 w-24"
                                                    type="number"
                                                    step="0.1"
                                                    min="-2"
                                                    max="2"
                                                    value={settings.presencePenalty ?? ""}
                                                    placeholder="0"
                                                    onChange={(event) =>
                                                        onUpdateNumber(
                                                            "presencePenalty",
                                                            event.target.value === ""
                                                                ? null
                                                                : Number(event.target.value)
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                value={[presenceValue]}
                                                min={-2}
                                                max={2}
                                                step={0.1}
                                                onValueChange={(value) =>
                                                    onUpdateNumber(
                                                        "presencePenalty",
                                                        value[0]
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <Label htmlFor="repetition">
                                                    Repetition penalty
                                                </Label>
                                                <Input
                                                    id="repetition"
                                                    className="h-8 w-24"
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    max="2"
                                                    value={settings.repetitionPenalty ?? ""}
                                                    placeholder="1"
                                                    onChange={(event) =>
                                                        onUpdateNumber(
                                                            "repetitionPenalty",
                                                            event.target.value === ""
                                                                ? null
                                                                : Number(event.target.value)
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                value={[repetitionValue]}
                                                min={0}
                                                max={2}
                                                step={0.1}
                                                onValueChange={(value) =>
                                                    onUpdateNumber(
                                                        "repetitionPenalty",
                                                        value[0]
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <Label htmlFor="seed">Seed</Label>
                                                <Input
                                                    id="seed"
                                                    className="h-8 w-24"
                                                    type="number"
                                                    value={settings.seed ?? ""}
                                                    placeholder="Auto"
                                                    onChange={(event) =>
                                                        onUpdateNumber(
                                                            "seed",
                                                            event.target.value === ""
                                                                ? null
                                                                : Number(event.target.value)
                                                        )
                                                    }
                                                />
                                            </div>
                      </div>
                  </div>
                  </div>
              </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onReset}
                            disabled={!onReset}
                        >
                            Reset
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onApplyToAll}
                            disabled={!canApplyToAll}
                        >
                            Apply to all
                        </Button>
                    </div>
                </div>
            </DialogContent>
            <Dialog open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
                <DialogContent className="max-w-xl p-4">
                    <DialogHeader>
                        <DialogTitle>Choose model</DialogTitle>
                        <DialogDescription>
                            Pick which model you are editing in this settings panel.
                        </DialogDescription>
                    </DialogHeader>
                    <Command>
                        <CommandInput placeholder="Search models..." />
                        <CommandList className="max-h-[52vh]">
                            <CommandEmpty>No models found.</CommandEmpty>
                            {groupedModelChoices.map(([orgName, choices]) => (
                                <CommandGroup key={orgName} heading={orgName}>
                                    {choices.map((choice) => (
                                        <CommandItem
                                            key={choice.id}
                                            value={`${choice.label} ${choice.orgName} ${choice.id}`}
                                            onSelect={() => {
                                                onModelChange?.(choice.id);
                                                setModelPickerOpen(false);
                                            }}
                                            className="gap-2"
                                        >
                                            <Logo
                                                id={choice.orgId}
                                                alt={choice.orgName}
                                                width={16}
                                                height={16}
                                                className="shrink-0"
                                            />
                                            <span className="truncate">
                                                {choice.label}
                                            </span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            ))}
                        </CommandList>
                    </Command>
                </DialogContent>
            </Dialog>
        </Dialog>
    );
}
