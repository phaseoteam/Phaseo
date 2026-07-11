"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Logo } from "@/components/Logo";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    getDefaultFavoriteModelIds,
    groupModelsByReleaseMonth,
    MODEL_SELECTOR_FAVORITES_STORAGE_KEY,
    normalizeFavoriteModelId,
} from "@/components/(chat)/playgroundConfig";
import { estimatePromptTokenCount } from "@/components/(chat)/playground/chat-playground-core";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ChatModelSettings } from "@/lib/indexeddb/chats";
import { ArrowLeft, CheckIcon, ChevronRight, RotateCcw, SearchIcon, Star } from "lucide-react";

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
        releaseDate?: string | null;
    }>;
    modelLabel?: string;
    providerOptions: Array<{ id: string; name: string; logoId?: string }>;
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

type SamplingNumberKey =
    | "temperature"
    | "maxOutputTokens"
    | "topP"
    | "topK"
    | "minP"
    | "topA"
    | "frequencyPenalty"
    | "presencePenalty"
    | "repetitionPenalty"
    | "seed";

const SAMPLING_NUMBER_KEYS: SamplingNumberKey[] = [
    "temperature",
    "maxOutputTokens",
    "topP",
    "topK",
    "minP",
    "topA",
    "frequencyPenalty",
    "presencePenalty",
    "repetitionPenalty",
    "seed",
];

function samplingValueToInput(value: number | null | undefined) {
    return typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : "";
}

function samplingDraftFromSettings(settings: ChatModelSettings) {
    return {
        temperature: samplingValueToInput(settings.temperature),
        maxOutputTokens: samplingValueToInput(settings.maxOutputTokens),
        topP: samplingValueToInput(settings.topP),
        topK: samplingValueToInput(settings.topK),
        minP: samplingValueToInput(settings.minP),
        topA: samplingValueToInput(settings.topA),
        frequencyPenalty: samplingValueToInput(settings.frequencyPenalty),
        presencePenalty: samplingValueToInput(settings.presencePenalty),
        repetitionPenalty: samplingValueToInput(settings.repetitionPenalty),
        seed: samplingValueToInput(settings.seed),
    } satisfies Record<SamplingNumberKey, string>;
}

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
    const reduceMotion = useReducedMotion();
    const [modelPickerOpen, setModelPickerOpen] = useState(false);
    const [modelPickerSearch, setModelPickerSearch] = useState("");
    const [modelPickerListReady, setModelPickerListReady] = useState(false);
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
    const [favoriteModelIds, setFavoriteModelIds] = useState<string[]>(() =>
        getDefaultFavoriteModelIds()
    );
    const [samplingDraft, setSamplingDraft] = useState<
        Record<SamplingNumberKey, string>
    >(() => samplingDraftFromSettings(settings));
    const samplingCommitTimersRef = useRef<
        Partial<Record<SamplingNumberKey, ReturnType<typeof setTimeout>>>
    >({});
    const pageTransition = reduceMotion
        ? { duration: 0 }
        : {
              duration: 0.16,
              ease: [0.16, 1, 0.3, 1] as const,
          };
    const parseSamplingDraftValue = useCallback((rawValue: string) => {
        if (rawValue.trim() === "") return null;
        const parsed = Number(rawValue);
        return Number.isFinite(parsed) ? parsed : null;
    }, []);
    const commitSamplingValue = useCallback(
        (key: SamplingNumberKey, rawValue: string) => {
            const timer = samplingCommitTimersRef.current[key];
            if (timer) {
                clearTimeout(timer);
                delete samplingCommitTimersRef.current[key];
            }
            onUpdateNumber(key, parseSamplingDraftValue(rawValue));
        },
        [onUpdateNumber, parseSamplingDraftValue]
    );
    const scheduleSamplingCommit = useCallback(
        (key: SamplingNumberKey, rawValue: string) => {
            const timer = samplingCommitTimersRef.current[key];
            if (timer) {
                clearTimeout(timer);
            }
            samplingCommitTimersRef.current[key] = setTimeout(() => {
                commitSamplingValue(key, rawValue);
            }, 250);
        },
        [commitSamplingValue]
    );
    const updateSamplingDraft = useCallback(
        (key: SamplingNumberKey, rawValue: string) => {
            setSamplingDraft((current) => ({
                ...current,
                [key]: rawValue,
            }));
            scheduleSamplingCommit(key, rawValue);
        },
        [scheduleSamplingCommit]
    );
    const getSamplingSliderValue = useCallback(
        (key: SamplingNumberKey, fallbackValue: number) => {
            const parsed = Number(samplingDraft[key]);
            return Number.isFinite(parsed)
                ? parsed
                : fallbackValue;
        },
        [samplingDraft]
    );
    useEffect(() => {
        setSamplingDraft(samplingDraftFromSettings(settings));
    }, [
        selectedModelId,
        settings.temperature,
        settings.maxOutputTokens,
        settings.topP,
        settings.topK,
        settings.minP,
        settings.topA,
        settings.frequencyPenalty,
        settings.presencePenalty,
        settings.repetitionPenalty,
        settings.seed,
    ]);
    useEffect(() => {
        return () => {
            for (const key of SAMPLING_NUMBER_KEYS) {
                const timer = samplingCommitTimersRef.current[key];
                if (timer) clearTimeout(timer);
            }
        };
    }, []);
    const filteredProviderOptions = supportedProvidersForModel
        ? providerOptions.filter((provider) =>
              supportedProvidersForModel.includes(provider.id)
          )
        : providerOptions;
    const providerValue =
        settings.providerId &&
        filteredProviderOptions.some(
            (provider) => provider.id === settings.providerId
        )
            ? settings.providerId
            : "auto";
    const selectedProviderLabel =
        providerValue === "auto"
            ? "Auto (Gateway)"
            : (filteredProviderOptions.find(
                  (provider) => provider.id === providerValue
              )?.name ?? "Auto (Gateway)");
    useEffect(() => {
        if (!modelPickerOpen) {
            setModelPickerListReady(false);
            return;
        }
        const rafId = requestAnimationFrame(() => {
            setModelPickerListReady(true);
        });
        return () => {
            cancelAnimationFrame(rafId);
        };
    }, [modelPickerOpen]);
    useEffect(() => {
        const availableFavoriteIds = new Set(
            modelChoices.map((choice) => normalizeFavoriteModelId(choice.id))
        );
        const fallbackIds = getDefaultFavoriteModelIds().filter((id) =>
            availableFavoriteIds.has(id)
        );
        if (typeof window === "undefined") {
            setFavoriteModelIds(fallbackIds);
            return;
        }
        const raw = window.localStorage.getItem(
            MODEL_SELECTOR_FAVORITES_STORAGE_KEY
        );
        if (!raw) {
            setFavoriteModelIds(fallbackIds);
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            const next = Array.isArray(parsed)
                ? parsed
                      .map((value) => normalizeFavoriteModelId(String(value)))
                      .filter((id) => availableFavoriteIds.has(id))
                : fallbackIds;
            setFavoriteModelIds(next.length > 0 ? next : fallbackIds);
        } catch {
            setFavoriteModelIds(fallbackIds);
        }
    }, [modelChoices, modelPickerOpen]);
    const normalizedModelChoices = useMemo(() => {
        return modelChoices.map((choice) => ({
            ...choice,
            releaseDate: choice.releaseDate ?? null,
            favoriteId: normalizeFavoriteModelId(choice.id),
        }));
    }, [modelChoices]);
    const filteredModelChoices = useMemo(() => {
        const query = modelPickerSearch.trim().toLowerCase();
        if (!query) return normalizedModelChoices;

        return normalizedModelChoices.filter((choice) =>
            [choice.label, choice.orgName, choice.orgId, choice.id]
                .join(" ")
                .toLowerCase()
                .includes(query)
        );
    }, [normalizedModelChoices, modelPickerSearch]);
    const favoriteModelIdSet = useMemo(
        () => new Set(favoriteModelIds),
        [favoriteModelIds]
    );
    const featuredModelChoices = useMemo(() => {
        const byFavoriteId = new Map(
            filteredModelChoices.map((choice) => [choice.favoriteId, choice])
        );
        return favoriteModelIds
            .map((favoriteId) => byFavoriteId.get(favoriteId))
            .filter((choice): choice is (typeof filteredModelChoices)[number] =>
                Boolean(choice)
            );
    }, [favoriteModelIds, filteredModelChoices]);
    const groupedModelChoices = useMemo(() => {
        const remainingChoices = filteredModelChoices.filter(
            (choice) => !favoriteModelIdSet.has(choice.favoriteId)
        );
        return groupModelsByReleaseMonth(remainingChoices);
    }, [favoriteModelIdSet, filteredModelChoices]);
    const modelPickerHasResults =
        featuredModelChoices.length > 0 || groupedModelChoices.length > 0;
    const selectedChoice =
        modelChoices.find((choice) => choice.id === selectedModelId) ?? null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={
                    modelPickerOpen
                        ? "w-[calc(100vw-2rem)] max-w-[720px] sm:max-w-[720px] !top-4 !bottom-4 h-[calc(100vh-2rem)] !max-h-none !translate-y-0 overflow-hidden p-4"
                        : "w-[calc(100vw-2rem)] max-w-[720px] sm:max-w-[720px] max-h-[85vh] overflow-hidden p-4"
                }
            >
                <div
                    className={
                        modelPickerOpen
                            ? "relative h-full min-h-0 min-w-0 overflow-hidden"
                            : "relative min-w-0 overflow-hidden"
                    }
                >
                <AnimatePresence initial={false} mode="popLayout">
                {modelPickerOpen ? (
                    <motion.div
                        key="model-picker"
                        initial={reduceMotion ? false : { opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={
                            reduceMotion
                                ? undefined
                                : { opacity: 0, transition: { duration: 0 } }
                        }
                        transition={pageTransition}
                        className="flex h-full min-h-0 flex-col overflow-hidden"
                    >
                        <div className="mb-3 flex items-center gap-3">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Back to model settings"
                                onClick={() => {
                                    setModelPickerSearch("");
                                    setModelPickerOpen(false);
                                }}
                                className="shrink-0"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div className="min-w-0">
                                <DialogTitle>Choose model</DialogTitle>
                                <DialogDescription>
                                    Pick which selected model you are editing.
                                </DialogDescription>
                            </div>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-popover p-1">
                            <div className="p-1 pb-0">
                                <div className="relative">
                                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={modelPickerSearch}
                                        onChange={(event) =>
                                            setModelPickerSearch(event.target.value)
                                        }
                                        placeholder="Search models..."
                                        className="h-8 rounded-2xl bg-input/50 pl-8"
                                    />
                                </div>
                            </div>
                            <ScrollArea
                                className="min-h-0 flex-1"
                                viewportClassName="p-3"
                            >
                                {!modelPickerListReady ? (
                                    <div className="py-6 text-center text-sm text-muted-foreground">
                                        Loading models...
                                    </div>
                                ) : null}
                                {modelPickerListReady && !modelPickerHasResults ? (
                                    <div className="py-6 text-center text-sm text-muted-foreground">
                                        No models found.
                                    </div>
                                ) : null}
                                {modelPickerListReady && featuredModelChoices.length > 0 ? (
                                    <div className="pb-3">
                                        <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-foreground">
                                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                                            Featured
                                        </div>
                                        <div className="grid gap-0.5">
                                            {featuredModelChoices.map((choice) => (
                                                <button
                                                    key={choice.id}
                                                    type="button"
                                                    onClick={() => {
                                                        onModelChange?.(choice.id);
                                                        setModelPickerSearch("");
                                                        setModelPickerOpen(false);
                                                    }}
                                                    className="flex min-h-7 w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                                                >
                                                    <Logo
                                                        id={choice.orgId}
                                                        alt={choice.orgName}
                                                        width={16}
                                                        height={16}
                                                        className="shrink-0 rounded-none"
                                                    />
                                                    <span className="min-w-0 flex-1 truncate">
                                                        {choice.orgName}: {choice.label}
                                                    </span>
                                                    {choice.id === selectedModelId ? (
                                                        <CheckIcon className="h-4 w-4 shrink-0 text-foreground" />
                                                    ) : (
                                                        <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                                {modelPickerListReady && groupedModelChoices.map((group) => (
                                    <div key={group.heading} className="pb-2">
                                        <div className="px-2 py-1.5 text-xs font-semibold text-foreground">
                                            {group.heading}
                                        </div>
                                        <div className="grid gap-0.5">
                                            {group.items.map((choice) => (
                                                <button
                                                    key={choice.id}
                                                    type="button"
                                                    onClick={() => {
                                                        onModelChange?.(choice.id);
                                                        setModelPickerSearch("");
                                                        setModelPickerOpen(false);
                                                    }}
                                                    className="flex min-h-7 w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                                                >
                                                    <Logo
                                                        id={choice.orgId}
                                                        alt={choice.orgName}
                                                        width={16}
                                                        height={16}
                                                        className="shrink-0 rounded-none"
                                                    />
                                                    <span className="min-w-0 flex-1 truncate">
                                                        {choice.orgName}: {choice.label}
                                                    </span>
                                                    {choice.id === selectedModelId ? (
                                                        <CheckIcon className="h-4 w-4 shrink-0 text-foreground" />
                                                    ) : null}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </ScrollArea>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="model-settings"
                        initial={reduceMotion ? false : { opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={
                            reduceMotion
                                ? undefined
                                : { opacity: 0, transition: { duration: 0 } }
                        }
                        transition={pageTransition}
                        className="min-w-0"
                    >
                <DialogHeader className="mb-3 space-y-1">
                    <DialogTitle>
                        Model settings
                        {modelLabel ? ` - ${modelLabel}` : ""}
                    </DialogTitle>
                    <DialogDescription>
                        Tune how this model responds in this chat.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid max-h-[75vh] min-w-0 gap-3 overflow-y-auto overflow-x-hidden pr-1">
                    <div className="grid gap-2">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
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
                                className="h-auto min-h-12 justify-between gap-3 px-3 py-2"
                                disabled={!onModelChange || modelChoices.length === 0}
                                onClick={() => {
                                    setModelPickerSearch("");
                                    setModelPickerOpen(true);
                                }}
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    {selectedChoice ? (
                                        <Logo
                                            id={selectedChoice.orgId}
                                            alt={selectedChoice.orgName}
                                            width={20}
                                            height={20}
                                            className="shrink-0 rounded-none"
                                        />
                                    ) : null}
                                    <span className="grid min-w-0 text-left">
                                        <span className="truncate text-sm font-medium text-foreground">
                                            {selectedChoice?.label ??
                                                modelLabel ??
                                                "Current model"}
                                        </span>
                                        <span className="truncate text-xs text-muted-foreground">
                                            {selectedChoice?.orgName ??
                                                "Choose which model these settings edit"}
                                        </span>
                                    </span>
                                </span>
                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </Button>
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Provider</Label>
                            <Select
                                value={providerValue}
                                onValueChange={(value) =>
                                    onUpdate({ providerId: value })
                                }
                            >
                                <SelectTrigger className="w-full min-w-0">
                                    <SelectValue
                                        className="min-w-0"
                                        placeholder="Auto (Gateway)"
                                    >
                                        {selectedProviderLabel}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="max-w-[min(var(--anchor-width),calc(100vw-2rem))]">
                                    <SelectItem value="auto">
                                        <div className="flex min-w-0 items-center gap-2">
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
                                            <span className="truncate">Auto (Gateway)</span>
                                        </div>
                                    </SelectItem>
                                    {filteredProviderOptions.map((provider) => (
                                        <SelectItem
                                            key={provider.id}
                                            value={provider.id}
                                        >
                                            <div className="flex min-w-0 items-center gap-2">
                                                <Logo
                                                    id={provider.logoId ?? provider.id}
                                                    alt={provider.name}
                                                    width={16}
                                                    height={16}
                                                    className="shrink-0"
                                                />
                                                <span className="truncate">
                                                    {provider.name}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <Separator />
                    <div className="grid gap-1.5">
                        <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="system-prompt">System prompt</Label>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                ~{estimatePromptTokenCount(settings.systemPrompt).toLocaleString()} tokens
                            </span>
                        </div>
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
                            <AccordionItem value="sampling" className="border-b-0">
                                <AccordionTrigger>
                                    <span>Sampling parameters</span>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="grid min-w-0 gap-3 px-1 pt-2">
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
                                                    value={samplingDraft.temperature}
                                                    placeholder="0.7"
                                                    onChange={(event) =>
                                                        updateSamplingDraft(
                                                            "temperature",
                                                            event.target.value
                                                        )
                                                    }
                                                    onBlur={(event) =>
                                                        commitSamplingValue(
                                                            "temperature",
                                                            event.target.value
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                className="mx-2 w-[calc(100%-1rem)]"
                                                value={[
                                                    getSamplingSliderValue(
                                                        "temperature",
                                                        temperatureValue
                                                    ),
                                                ]}
                                                min={0}
                                                max={2}
                                                step={0.1}
                                                onValueChange={(value) =>
                                                    setSamplingDraft((current) => ({
                                                        ...current,
                                                        temperature: String(value[0]),
                                                    }))
                                                }
                                                onValueCommit={(value) =>
                                                    commitSamplingValue(
                                                        "temperature",
                                                        String(value[0])
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
                                                    value={samplingDraft.maxOutputTokens}
                                                    placeholder="800"
                                                    onChange={(event) =>
                                                        updateSamplingDraft(
                                                            "maxOutputTokens",
                                                            event.target.value
                                                        )
                                                    }
                                                    onBlur={(event) =>
                                                        commitSamplingValue(
                                                            "maxOutputTokens",
                                                            event.target.value
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                className="mx-2 w-[calc(100%-1rem)]"
                                                value={[
                                                    getSamplingSliderValue(
                                                        "maxOutputTokens",
                                                        maxTokensValue
                                                    ),
                                                ]}
                                                min={1}
                                                max={4096}
                                                step={1}
                                                onValueChange={(value) =>
                                                    setSamplingDraft((current) => ({
                                                        ...current,
                                                        maxOutputTokens: String(value[0]),
                                                    }))
                                                }
                                                onValueCommit={(value) =>
                                                    commitSamplingValue(
                                                        "maxOutputTokens",
                                                        String(value[0])
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
                                                    value={samplingDraft.topP}
                                                    placeholder="1"
                                                    onChange={(event) =>
                                                        updateSamplingDraft(
                                                            "topP",
                                                            event.target.value
                                                        )
                                                    }
                                                    onBlur={(event) =>
                                                        commitSamplingValue(
                                                            "topP",
                                                            event.target.value
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                className="mx-2 w-[calc(100%-1rem)]"
                                                value={[
                                                    getSamplingSliderValue(
                                                        "topP",
                                                        topPValue
                                                    ),
                                                ]}
                                                min={0}
                                                max={1}
                                                step={0.01}
                                                onValueChange={(value) =>
                                                    setSamplingDraft((current) => ({
                                                        ...current,
                                                        topP: String(value[0]),
                                                    }))
                                                }
                                                onValueCommit={(value) =>
                                                    commitSamplingValue(
                                                        "topP",
                                                        String(value[0])
                                                    )
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
                                                    value={samplingDraft.topK}
                                                    placeholder="40"
                                                    onChange={(event) =>
                                                        updateSamplingDraft(
                                                            "topK",
                                                            event.target.value
                                                        )
                                                    }
                                                    onBlur={(event) =>
                                                        commitSamplingValue(
                                                            "topK",
                                                            event.target.value
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                className="mx-2 w-[calc(100%-1rem)]"
                                                value={[
                                                    getSamplingSliderValue(
                                                        "topK",
                                                        topKValue
                                                    ),
                                                ]}
                                                min={1}
                                                max={200}
                                                step={1}
                                                onValueChange={(value) =>
                                                    setSamplingDraft((current) => ({
                                                        ...current,
                                                        topK: String(value[0]),
                                                    }))
                                                }
                                                onValueCommit={(value) =>
                                                    commitSamplingValue(
                                                        "topK",
                                                        String(value[0])
                                                    )
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
                                                    value={samplingDraft.minP}
                                                    placeholder="0"
                                                    onChange={(event) =>
                                                        updateSamplingDraft(
                                                            "minP",
                                                            event.target.value
                                                        )
                                                    }
                                                    onBlur={(event) =>
                                                        commitSamplingValue(
                                                            "minP",
                                                            event.target.value
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                className="mx-2 w-[calc(100%-1rem)]"
                                                value={[
                                                    getSamplingSliderValue(
                                                        "minP",
                                                        minPValue
                                                    ),
                                                ]}
                                                min={0}
                                                max={1}
                                                step={0.01}
                                                onValueChange={(value) =>
                                                    setSamplingDraft((current) => ({
                                                        ...current,
                                                        minP: String(value[0]),
                                                    }))
                                                }
                                                onValueCommit={(value) =>
                                                    commitSamplingValue(
                                                        "minP",
                                                        String(value[0])
                                                    )
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
                                                    value={samplingDraft.topA}
                                                    placeholder="0"
                                                    onChange={(event) =>
                                                        updateSamplingDraft(
                                                            "topA",
                                                            event.target.value
                                                        )
                                                    }
                                                    onBlur={(event) =>
                                                        commitSamplingValue(
                                                            "topA",
                                                            event.target.value
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                className="mx-2 w-[calc(100%-1rem)]"
                                                value={[
                                                    getSamplingSliderValue(
                                                        "topA",
                                                        topAValue
                                                    ),
                                                ]}
                                                min={0}
                                                max={1}
                                                step={0.01}
                                                onValueChange={(value) =>
                                                    setSamplingDraft((current) => ({
                                                        ...current,
                                                        topA: String(value[0]),
                                                    }))
                                                }
                                                onValueCommit={(value) =>
                                                    commitSamplingValue(
                                                        "topA",
                                                        String(value[0])
                                                    )
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
                                                    value={samplingDraft.frequencyPenalty}
                                                    placeholder="0"
                                                    onChange={(event) =>
                                                        updateSamplingDraft(
                                                            "frequencyPenalty",
                                                            event.target.value
                                                        )
                                                    }
                                                    onBlur={(event) =>
                                                        commitSamplingValue(
                                                            "frequencyPenalty",
                                                            event.target.value
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                className="mx-2 w-[calc(100%-1rem)]"
                                                value={[
                                                    getSamplingSliderValue(
                                                        "frequencyPenalty",
                                                        frequencyValue
                                                    ),
                                                ]}
                                                min={-2}
                                                max={2}
                                                step={0.1}
                                                onValueChange={(value) =>
                                                    setSamplingDraft((current) => ({
                                                        ...current,
                                                        frequencyPenalty: String(value[0]),
                                                    }))
                                                }
                                                onValueCommit={(value) =>
                                                    commitSamplingValue(
                                                        "frequencyPenalty",
                                                        String(value[0])
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
                                                    value={samplingDraft.presencePenalty}
                                                    placeholder="0"
                                                    onChange={(event) =>
                                                        updateSamplingDraft(
                                                            "presencePenalty",
                                                            event.target.value
                                                        )
                                                    }
                                                    onBlur={(event) =>
                                                        commitSamplingValue(
                                                            "presencePenalty",
                                                            event.target.value
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                className="mx-2 w-[calc(100%-1rem)]"
                                                value={[
                                                    getSamplingSliderValue(
                                                        "presencePenalty",
                                                        presenceValue
                                                    ),
                                                ]}
                                                min={-2}
                                                max={2}
                                                step={0.1}
                                                onValueChange={(value) =>
                                                    setSamplingDraft((current) => ({
                                                        ...current,
                                                        presencePenalty: String(value[0]),
                                                    }))
                                                }
                                                onValueCommit={(value) =>
                                                    commitSamplingValue(
                                                        "presencePenalty",
                                                        String(value[0])
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
                                                    value={samplingDraft.repetitionPenalty}
                                                    placeholder="1"
                                                    onChange={(event) =>
                                                        updateSamplingDraft(
                                                            "repetitionPenalty",
                                                            event.target.value
                                                        )
                                                    }
                                                    onBlur={(event) =>
                                                        commitSamplingValue(
                                                            "repetitionPenalty",
                                                            event.target.value
                                                        )
                                                    }
                                                />
                                            </div>
                                            <Slider
                                                className="mx-2 w-[calc(100%-1rem)]"
                                                value={[
                                                    getSamplingSliderValue(
                                                        "repetitionPenalty",
                                                        repetitionValue
                                                    ),
                                                ]}
                                                min={0}
                                                max={2}
                                                step={0.1}
                                                onValueChange={(value) =>
                                                    setSamplingDraft((current) => ({
                                                        ...current,
                                                        repetitionPenalty: String(value[0]),
                                                    }))
                                                }
                                                onValueCommit={(value) =>
                                                    commitSamplingValue(
                                                        "repetitionPenalty",
                                                        String(value[0])
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
                                                    value={samplingDraft.seed}
                                                    placeholder="Auto"
                                                    onChange={(event) =>
                                                        updateSamplingDraft(
                                                            "seed",
                                                            event.target.value
                                                        )
                                                    }
                                                    onBlur={(event) =>
                                                        commitSamplingValue(
                                                            "seed",
                                                            event.target.value
                                                        )
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                        <AlertDialog
                            open={resetConfirmOpen}
                            onOpenChange={setResetConfirmOpen}
                        >
                            <AlertDialogTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={!onReset}
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    Reset
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Reset model settings?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will restore this model to its default provider,
                                        prompt, streaming, and sampling settings.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() => {
                                            onReset?.();
                                            setResetConfirmOpen(false);
                                        }}
                                    >
                                        Reset settings
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
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
                    </motion.div>
                )}
                </AnimatePresence>
                </div>
            </DialogContent>
        </Dialog>
    );
}
