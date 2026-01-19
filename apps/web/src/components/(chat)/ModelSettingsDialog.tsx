"use client";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ChatSettings } from "@/lib/indexeddb/chats";

type ModelSettingsDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    settings: ChatSettings;
    providerOptions: Array<{ id: string; name: string }>;
    temperatureValue: number;
    maxTokensValue: number;
    topPValue: number;
    topKValue: number;
    minPValue: number;
    topAValue: number;
    frequencyValue: number;
    presenceValue: number;
    repetitionValue: number;
    onUpdate: (partial: Partial<ChatSettings>) => void;
    onUpdateNumber: (key: keyof ChatSettings, value: number | null) => void;
};

export function ModelSettingsDialog({
    open,
    onOpenChange,
    settings,
    providerOptions,
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
}: ModelSettingsDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Model settings</DialogTitle>
                    <DialogDescription>
                        Tune how this model responds for the current chat.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid max-h-[75vh] gap-6 overflow-y-auto pr-2">
                    <div className="grid gap-2">
                        <Label htmlFor="system-prompt">System prompt</Label>
                        <Textarea
                            id="system-prompt"
                            value={settings.systemPrompt ?? ""}
                            onChange={(event) =>
                                onUpdate({ systemPrompt: event.target.value })
                            }
                            rows={6}
                        />
                    </div>
                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <Label>Provider</Label>
                            <Select
                                value={settings.providerId ?? "auto"}
                                onValueChange={(value) =>
                                    onUpdate({ providerId: value })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Auto (Conduit)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">
                                        Auto (Conduit)
                                    </SelectItem>
                                    {providerOptions.map((provider) => (
                                        <SelectItem
                                            key={provider.id}
                                            value={provider.id}
                                        >
                                            {provider.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-3 rounded-lg border border-border px-3 py-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium">Reasoning</p>
                                    <p className="text-xs text-muted-foreground">
                                        Enable chain-of-thought effort.
                                    </p>
                                </div>
                                <Switch
                                    checked={settings.reasoningEnabled ?? false}
                                    onCheckedChange={(checked) =>
                                        onUpdate({ reasoningEnabled: checked })
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Effort</Label>
                                <Select
                                    value={settings.reasoningEffort ?? "medium"}
                                    onValueChange={(value) =>
                                        onUpdate({
                                            reasoningEffort:
                                                value as ChatSettings["reasoningEffort"],
                                        })
                                    }
                                    disabled={!settings.reasoningEnabled}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Medium" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        <SelectItem value="minimal">
                                            Minimal
                                        </SelectItem>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">
                                            Medium
                                        </SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="xhigh">
                                            Extra high
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <div className="grid gap-4">
                        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
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
                    <div className="grid gap-4">
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
                </div>
            </DialogContent>
        </Dialog>
    );
}
