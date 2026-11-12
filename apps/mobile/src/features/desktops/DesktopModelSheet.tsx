import { Lock } from "lucide-react-native";
import { useCallback, useDeferredValue, useState } from "react";
import { View } from "react-native";
import { Logo } from "@/components/Logo";
import { Icon, OptionSheet, Segmented, Text } from "@/components/ui";
import { ModelSheet, type SheetModel } from "@/features/chat/ModelSheet";
import { effortRows, sheetModelDetail } from "@/features/chat/modelSheetRows";
import { useChatModelOptions } from "@/features/chat/models";
import { agentOf, modelOf, permissionLabel, sheetTabs, tabOf, threadSheetRows, type ModelChoice, type ModelList, type SheetItem, type SheetTab } from "./newThread";
import type { PhoneChatMode, PhonePermissionMode } from "./protocol";

/** The lab whose logo stands for a coding agent's own models when the computer doesn't name one. */
const AGENT_LABS: Record<string, string> = { codex: "openai", claude: "anthropic", grok: "xai" };

/** The lab logo for a thread's model: the one the computer names, a Phaseo id's prefix, or the agent's maker. */
export function modelLogo({ organisationId, model, harness, label, size = 18 }: { organisationId?: string | null; model: string; harness?: string | null; label: string; size?: number }) {
  const lab = organisationId ?? (model.includes("/") ? model.split("/")[0] : null) ?? (harness ? AGENT_LABS[harness] : undefined) ?? null;
  return <Logo id={lab} label={label} size={size} />;
}

/** The logo for a new thread's choice. */
export function choiceLogo(list: ModelList, choice: ModelChoice) {
  const agent = agentOf(list, choice);
  return modelLogo({ organisationId: modelOf(list, choice)?.organisationId, model: choice.model, harness: agent?.harness, label: agent?.name ?? choice.model });
}

export const MODE_LABELS: Record<PhoneChatMode, string> = { chat: "Chat", code: "Code", plan: "Plan" };

/** The thread's mode, changeable in the settings sheet. */
export type ModeControl = { value: PhoneChatMode; options: readonly PhoneChatMode[]; onChange(mode: PhoneChatMode): void };

/** Mode and permissions, under the chosen model: the mode switches here, the permissions only on the computer. */
function ThreadSettingsRows({ mode, permission }: { mode?: ModeControl | null; permission?: PhonePermissionMode | null }) {
  if (!mode && !permission) return null;
  return (
    <View className="gap-3 px-4 pt-3">
      {mode ? (
        <View className="flex-row items-center gap-3">
          <Text variant="label" className="w-24">Mode</Text>
          <Segmented<PhoneChatMode> className="flex-1" value={mode.value} options={mode.options.map((value) => ({ value, label: MODE_LABELS[value] }))} onChange={mode.onChange} />
        </View>
      ) : null}
      {permission ? (
        <View accessible accessibilityLabel={`Permissions: ${permissionLabel(permission)}. Set on the computer.`} className="min-h-8 flex-row items-center gap-3">
          <Text variant="label" className="w-24">Permissions</Text>
          <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
            <Icon icon={Lock} tone="muted" size={13} />
            <Text variant="small" numberOfLines={1} className="shrink">{permissionLabel(permission)}</Text>
            <Text variant="caption" numberOfLines={1} className="shrink">· Set on the computer</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The mode alone, for a thread whose models the computer can't list. */
export function ModeSheet({ mode, open, onClose }: { mode: ModeControl; open: boolean; onClose(): void }) {
  return <OptionSheet open={open} title="Mode" value={mode.value} options={mode.options.map((value) => ({ value, label: MODE_LABELS[value] }))} onChange={mode.onChange} onClose={onClose} />;
}

/**
 * The thread's settings, opened from the model in the composer: the chosen model and its effort, the mode (Chat,
 * Code, Plan) and the permissions, which only the computer changes. Then the models: Phaseo and On this computer tabs
 * as in the window, the window's favourites first, Phaseo's models by release month (named and priced from this
 * phone's catalogue where it knows them), and each coding agent's models under its name with the older ones folded.
 */
export function DesktopModelSheet({ list, choice, onChoose, open, onClose, mode, permission }: { list: ModelList; choice: ModelChoice; onChoose(choice: ModelChoice): void; open: boolean; onClose(): void; mode?: ModeControl | null; permission?: PhonePermissionMode | null }) {
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
      title={mode || permission ? "Thread settings" : "Model"}
      settings={<ThreadSettingsRows mode={mode} permission={permission} />}
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
