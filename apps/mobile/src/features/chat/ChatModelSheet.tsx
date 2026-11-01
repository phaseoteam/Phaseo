import { Sparkles } from "lucide-react-native";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { Badge, Chip, ChipRow, toast } from "@/components/ui";
import { formatPrice, formatTokens } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { modelReasoningSupport, REASONING_LABELS, resolveReasoningEffort } from "./capabilities";
import { useFavourites } from "./favourites";
import { isNewModel, isSelectable, type ChatModelOption, type PickerFilters } from "./modelOptions";
import { useChatModelOptions, useModelLabels } from "./models";
import { chatSheetSections, effortRows, effortSummary, modelControlLabel, modelSheetRows, type Effort } from "./modelSheetRows";
import { ModelSheet, type SheetModel } from "./ModelSheet";
import { rememberModel, useRecentModels } from "./recentModels";
import type { ModelSettings } from "./settings";
import { saveSettings, setModelsFor } from "./state";

/**
 * A Phaseo model's effort levels, from its routes (the chosen provider's, or every provider's on Auto). Reasoning
 * left off is the model's default; on, the stored effort as the routes accept it.
 */
export function chatEffort(option: ChatModelOption | null | undefined, settings: ModelSettings | undefined) {
  const support = modelReasoningSupport(option?.routes ?? [], settings?.providerId);
  const efforts: Effort[] = (support?.supportedValues ?? []).map((id) => ({ id, label: REASONING_LABELS[id] }));
  const selected = settings?.reasoningEnabled && efforts.length ? resolveReasoningEffort(settings.reasoningEffort ?? support?.defaultValue ?? "medium", support) : null;
  return { efforts, defaultId: support?.defaultValue ?? null, selected };
}

/** The composer's control for a Phaseo chat: the first model and its effort, and how many more answer beside it. */
export function useChatModelLabel(models: string[], settings: Record<string, ModelSettings>) {
  const labels = useModelLabels();
  const first = models[0];
  if (!first) return "Choose a model";
  const { label, option } = labels(first, settings[first]);
  const { efforts, defaultId, selected } = chatEffort(option, settings[first]);
  return modelControlLabel(label, effortSummary(efforts, defaultId, selected), models.length - 1);
}

function facts(option: ChatModelOption) {
  const parts = [option.orgName];
  if (option.contextWindow) parts.push(`${formatTokens(option.contextWindow)} context`);
  if (!option.free && option.inputPrice != null && option.outputPrice != null) parts.push(`${formatPrice(option.inputPrice)} in · ${formatPrice(option.outputPrice)} out`);
  return parts.join(" · ");
}

/**
 * The model sheet for a Phaseo chat (or the new chat's draft with no `chatId`). A pick replaces the first model,
 * keeping any others that answer beside it (the chips above the chat add those); the effort applies to that model.
 */
export function ChatModelSheet({ chatId, models, settings, open, onClose }: { chatId: string | null; models: string[]; settings: Record<string, ModelSettings>; open: boolean; onClose(): void }) {
  const { options, byId, isLoading, error, refetch } = useChatModelOptions();
  const favourites = useFavourites(options);
  const recents = useRecentModels("chat");
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query);
  const [filters, setFilters] = useState<PickerFilters>({ free: false, new: false });
  const [expanded, setExpanded] = useState(false);
  const [nowMs] = useState(() => Date.now());
  const first = models[0] ?? null;
  const option = first ? byId.get(first) : undefined;

  const rows = useMemo(() => {
    if (isLoading || (error && !options.length)) return null;
    const { pinned, rest } = chatSheetSections({ options, query: search, favourites, recents, filters, nowMs });
    return modelSheetRows<ChatModelOption>({ pinned, rest: rest.map((section) => ({ key: section.key, title: section.title, items: section.items })), idOf: (item) => item.modelId, expanded });
  }, [isLoading, error, options, search, favourites, recents, filters, nowMs, expanded]);

  const describe = useCallback((item: ChatModelOption): SheetModel => ({
    id: item.modelId,
    label: item.label,
    detail: facts(item),
    orgId: item.orgId,
    orgName: item.orgName,
    disabled: !isSelectable(item),
    badge: !isSelectable(item) ? <Badge label="Coming soon" /> : item.free ? <Badge label="Free" tone="success" /> : isNewModel(item.releaseDate, nowMs) ? <Badge label="New" tone="primary" /> : null,
  }), [nowMs]);

  const pick = useCallback((item: ChatModelOption) => {
    if (!isSelectable(item)) {
      haptic("error");
      toast(`${item.label} isn't on Phaseo yet.`);
      return;
    }
    if (item.modelId !== first) haptic("selection");
    setModelsFor(chatId, [item.modelId, ...models.slice(1).filter((id) => id !== item.modelId)]);
    rememberModel("chat", item.modelId);
  }, [chatId, models, first]);

  const effortState = chatEffort(option, first ? settings[first] : undefined);
  const effort = first && effortState.efforts.length ? {
    model: option?.label ?? first,
    rows: effortRows(effortState.efforts, effortState.defaultId, effortState.selected),
    onPick: (id: string | null) => {
      const current = settings[first] ?? {};
      saveSettings(chatId, first, id ? { ...current, reasoningEnabled: true, reasoningEffort: id as ModelSettings["reasoningEffort"] } : { ...current, reasoningEnabled: false, reasoningEffort: undefined });
    },
  } : null;

  return (
    <ModelSheet<ChatModelOption>
      open={open}
      onClose={onClose}
      query={query}
      onQuery={(value) => { setQuery(value); setExpanded(false); }}
      controls={(
        <ChipRow className="pb-2">
          <Chip label="Free" icon={Sparkles} selected={filters.free} onPress={() => setFilters((current) => ({ ...current, free: !current.free }))} />
          <Chip label="New" selected={filters.new} onPress={() => setFilters((current) => ({ ...current, new: !current.new }))} />
        </ChipRow>
      )}
      rows={rows}
      describe={describe}
      selectedId={first}
      onPick={pick}
      onShowMore={() => setExpanded(true)}
      effort={effort}
      error={error}
      onRetry={refetch}
    />
  );
}
