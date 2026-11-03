import { Lock } from "lucide-react-native";
import { useCallback, useDeferredValue, useState } from "react";
import { View } from "react-native";
import { Logo } from "@/components/Logo";
import { Chip, Icon, Segmented, Text } from "@/components/ui";
import { ModelSheet, type SheetModel } from "@/features/chat/ModelSheet";
import { effortRows, modelLabelText, sheetModelDetail } from "@/features/chat/modelSheetRows";
import { useChatModelOptions } from "@/features/chat/models";
import { agentOf, choiceLabel, modelOf, permissionLabel, sheetTabs, tabOf, threadSheetRows, type ModelChoice, type ModelList, type SheetItem, type SheetTab } from "./newThread";
import type { PhonePermissionMode } from "./protocol";

/** The lab whose logo stands for a coding agent's own models when the computer doesn't name one. */
const AGENT_LABS: Record<string, string> = { codex: "openai", claude: "anthropic", grok: "xai" };

/** The permissions a thread runs with, which only the computer changes. */
export function PermissionChip({ mode }: { mode: PhonePermissionMode }) {
  return (
    <View accessible accessibilityLabel={`Permissions: ${permissionLabel(mode)}. Set on the computer.`} className="h-8 flex-row items-center gap-1.5 rounded-md px-2">
      <Icon icon={Lock} tone="muted" size={13} />
      <Text variant="small" className="text-muted-foreground">{permissionLabel(mode)}</Text>
    </View>
  );
}

export function ModelChip({ list, choice, unavailable, onPress, unavailableLabel = "The computer picks the model" }: { list: ModelList | null; choice: ModelChoice | null; unavailable: boolean; onPress(): void; unavailableLabel?: string }) {
  if (!list || !choice) return <Chip label={unavailable ? unavailableLabel : "Loading models…"} />;
  const agent = agentOf(list, choice);
  const model = modelOf(list, choice);
  const lab = model?.organisationId ?? (agent ? AGENT_LABS[agent.harness] : undefined) ?? null;
  return <Chip label={modelLabelText(choiceLabel(list, choice))} leading={<Logo id={lab} label={agent?.name ?? choice.model} size={16} bare />} dropdown onPress={onPress} />;
}

/**
 * The model sheet for a new thread: Phaseo and On this computer tabs as in the window, the window's favourites first,
 * Phaseo's models by release month (named and priced from this phone's catalogue where it knows them), and each coding
 * agent's models under its name with the older ones folded. The picked model's efforts fold into its row.
 */
export function DesktopModelSheet({ list, choice, onChoose, open, onClose }: { list: ModelList; choice: ModelChoice; onChoose(choice: ModelChoice): void; open: boolean; onClose(): void }) {
  const tabs = sheetTabs(list);
  const [tab, setTab] = useState<SheetTab>(() => tabOf(list, choice));
  const active = tabs.includes(tab) ? tab : tabs[0] ?? "local";
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query);
  const [olderOpen, setOlderOpen] = useState<string[]>([]);
  const { byId } = useChatModelOptions();
  const rows = threadSheetRows({ list, tab: active, query: search, olderOpen });
  const describe = useCallback(({ key, agent, model }: SheetItem): SheetModel => {
    if (agent.source === "phaseo") {
      const option = byId.get(model.id);
      return { id: key, label: option?.label ?? model.name, detail: option ? sheetModelDetail(option) : model.id, orgId: option?.orgId ?? model.organisationId ?? model.id.split("/")[0] ?? null, orgName: option?.orgName ?? null };
    }
    return { id: key, label: model.name, detail: model.name === model.id ? agent.name : `${agent.name} · ${model.id}`, orgId: model.organisationId ?? AGENT_LABS[agent.harness] ?? null, orgName: agent.name };
  }, [byId]);
  const agent = agentOf(list, choice);
  const model = modelOf(list, choice);
  const selectedKey = `${choice.harness}:${choice.accountId ?? ""}:${choice.model}`;
  const pick = useCallback((item: SheetItem) => {
    // Another model starts on its own default effort.
    if (`${item.agent.harness}:${item.agent.accountId ?? ""}:${item.model.id}` !== selectedKey) onChoose({ harness: item.agent.harness, ...(item.agent.accountId ? { accountId: item.agent.accountId } : {}), model: item.model.id, effort: null });
  }, [onChoose, selectedKey]);
  const toggleOlder = useCallback((key: string) => {
    const harness = key.startsWith("older:") ? key.slice("older:".length) : null;
    if (harness) setOlderOpen((current) => (current.includes(harness) ? current.filter((value) => value !== harness) : [...current, harness]));
  }, []);
  return (
    <ModelSheet<SheetItem>
      open={open}
      onClose={onClose}
      query={query}
      onQuery={setQuery}
      controls={tabs.length > 1 ? (
        <View className="px-4">
          <Segmented<SheetTab> value={active} options={tabs.map((value) => ({ value, label: value === "phaseo" ? "Phaseo" : "On this computer" }))} onChange={setTab} />
        </View>
      ) : null}
      rows={rows}
      describe={describe}
      selected={agent && model ? describe({ key: selectedKey, agent, model }) : { id: selectedKey, label: choice.model }}
      selectedId={selectedKey}
      onPick={pick}
      onShowMore={toggleOlder}
      effort={model?.efforts?.length ? { model: model.name, rows: effortRows(model.efforts, model.defaultEffort, choice.effort), onPick: (effort) => onChoose({ ...choice, effort }) } : null}
    />
  );
}
