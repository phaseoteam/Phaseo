import { useRouter } from "expo-router";
import { ChevronDown, ChevronRight, Layers, Layers3, Rocket, RotateCcw, Shuffle, Trash2, Copy as CopyAll, Zap, type LucideIcon } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Button, confirm, Divider, Header, Icon, Select, Slider, Switch, Text, TextField, toast, type SelectOption } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { useAppearance } from "@/providers/AppearanceProvider";
import { modelReasoningSupport, modelServiceTierSupport, REASONING_LABELS, resolveReasoningEffort, SERVICE_TIER_LABELS, serviceTierOptions, type ReasoningEffort, type ServiceTier } from "./capabilities";
import { useChatModelOptions, useModelLabels } from "./models";
import { ADVANCED_SETTING_KEYS, NUMBER_SETTINGS, normaliseNumberSetting, type ModelSettings, type NumberSettingKey } from "./settings";
import { applySettingsToAll, chatModelStore, draftSettingsStore, saveSettings, setModelsFor, useChat } from "./state";

/** The website's tier icons and colours (lib/models/tierFilterStyles.ts: blue, violet, fuchsia and sky 600/400). */
const TIER_ICONS: Record<ServiceTier, { icon: LucideIcon; light: string; dark: string }> = {
  standard: { icon: Layers3, light: "#2563eb", dark: "#60a5fa" },
  priority: { icon: Zap, light: "#7c3aed", dark: "#a78bfa" },
  ultrafast: { icon: Rocket, light: "#c026d3", dark: "#e879f9" },
  flex: { icon: Shuffle, light: "#0284c7", dark: "#38bdf8" },
};

const CHARS_PER_TOKEN = 4;
const SAVE_DELAY_MS = 300;

/**
 * One model's settings in a chat, like the website's ModelSettingsDialog: name, reasoning, provider,
 * service tier, system prompt and sampling. A tall bottom sheet on phones and a centred dialog on
 * tablets (RouteSheet). Changes save as you go and apply from the next answer.
 */
export function ModelSettingsSheet({ chatId, modelId }: { chatId: string | null; modelId: string }) {
  const { chat } = useChat(chatId);
  const draftModels = chatModelStore.use();
  const models = chatId ? chat?.models ?? [] : draftModels;
  const [editing, setEditing] = useState(modelId);
  // A model removed from the chat while open falls back to the first one left.
  const current = models.includes(editing) ? editing : models[0] ?? editing;
  return <SettingsForm key={current} chatId={chatId} modelId={current} models={models} onSwitch={setEditing} />;
}

function SettingsForm({ chatId, modelId, models, onSwitch }: { chatId: string | null; modelId: string; models: string[]; onSwitch(model: string): void }) {
  const router = useRouter();
  const { split } = useLayout();
  const { resolved } = useAppearance();
  const { chat } = useChat(chatId);
  const draft = draftSettingsStore.use();
  const stored = (chatId ? chat?.modelSettings[modelId] : draft[modelId]) ?? {};
  const [form, setForm] = useState<ModelSettings>(stored);
  const [advancedOpen, setAdvancedOpen] = useState(() => ADVANCED_SETTING_KEYS.some((key) => stored[key] != null));
  const labels = useModelLabels();
  const { byId } = useChatModelOptions();
  const option = byId.get(modelId);
  const routes = option?.routes ?? [];
  const { label, orgId, orgName } = labels(modelId);

  // Save shortly after each change, and straight away when the sheet closes.
  const pending = useRef<ModelSettings | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (pending.current) saveSettings(chatId, modelId, pending.current);
    pending.current = null;
  }, [chatId, modelId]);
  useEffect(() => flush, [flush]);
  const update = (patch: Partial<ModelSettings>) => {
    setForm((previous) => ({ ...previous, ...patch }));
    pending.current = { ...(pending.current ?? form), ...patch };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const providerId = form.providerId && routes.some((route) => route.providerId === form.providerId) ? form.providerId : "auto";
  const reasoningSupport = modelReasoningSupport(routes, providerId);
  const efforts = reasoningSupport?.supportedValues ?? [];
  const effort = resolveReasoningEffort(form.reasoningEffort ?? reasoningSupport?.defaultValue ?? "medium", reasoningSupport);
  const tiers = serviceTierOptions(modelServiceTierSupport(routes, providerId));
  const tier = form.serviceTier && tiers.includes(form.serviceTier) ? form.serviceTier : "standard";

  const providerOptions: SelectOption<string>[] = [
    { value: "auto", label: "Auto", icon: Layers, description: "Phaseo picks the provider" },
    ...routes.map((route) => ({ value: route.providerId, label: route.providerName, leading: <Logo id={route.logoId} label={route.providerName} size={18} bare /> })),
  ];
  const tierIcon = (value: ServiceTier) => { const meta = TIER_ICONS[value]; return <Icon icon={meta.icon} color={meta[resolved]} size={16} />; };

  const reset = async () => {
    const ok = await confirm({ title: "Reset model settings?", body: "This restores this model's default provider, prompt, reasoning and sampling settings in this chat.", confirmLabel: "Reset settings" });
    if (!ok) return;
    clearTimeout(timer.current);
    pending.current = null;
    setForm({});
    saveSettings(chatId, modelId, {});
  };
  const applyToAll = () => {
    flush();
    applySettingsToAll(chatId, modelId, models);
    toast(`Applied to ${models.length - 1} other ${models.length === 2 ? "model" : "models"}. Providers and names stay as they were.`, { tone: "success" });
  };
  const remove = async () => {
    const ok = await confirm({ title: `Remove ${label} from this chat?`, body: "Its earlier answers stay. It won't answer new messages.", confirmLabel: "Remove", destructive: true });
    if (!ok) return;
    flush();
    setModelsFor(chatId, models.filter((model) => model !== modelId));
  };

  return (
    <View className="flex-1">
      <Header title="Model settings" subtitle="Tune how this model responds in this chat." right={<Button label="Done" size="sm" variant="ghost" onPress={() => { flush(); router.back(); }} />} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-10" automaticallyAdjustKeyboardInsets>
        <Field label="Model">
          {models.length > 1 ? (
            <Select
              value={modelId}
              title="Edit settings for"
              options={models.map((model) => { const entry = labels(model, model === modelId ? form : chat?.modelSettings[model] ?? draft[model]); return { value: model, label: entry.label, leading: <Logo id={entry.orgId} label={entry.orgName} size={18} bare /> }; })}
              onChange={(next) => { flush(); onSwitch(next); }}
            />
          ) : (
            <View className="min-h-12 flex-row items-center gap-3 rounded-md border border-border px-3 py-2">
              <Logo id={orgId} label={orgName} size={22} bare />
              <View className="flex-1">
                <Text variant="small" numberOfLines={1} className="font-semibold">{label}</Text>
                <Text variant="caption" numberOfLines={1}>{orgName}</Text>
              </View>
            </View>
          )}
        </Field>

        <Field label="Chat display name">
          <TextField value={form.displayName ?? ""} onChangeText={(displayName) => update({ displayName })} placeholder={label} returnKeyType="done" />
        </Field>

        <Field label="Reasoning" detail={efforts.length ? (form.reasoningEnabled ? REASONING_LABELS[effort] : "Off") : undefined}>
          {efforts.length ? (
            <>
              <View className="min-h-11 flex-row items-center justify-between gap-3">
                <Text variant="muted" className="flex-1">Think before answering, at the effort you choose.</Text>
                <Switch value={Boolean(form.reasoningEnabled)} onValueChange={(on) => update({ reasoningEnabled: on, reasoningEffort: on ? form.reasoningEffort ?? effort : form.reasoningEffort })} accessibilityLabel="Reasoning" />
              </View>
              {form.reasoningEnabled ? (
                <Select value={effort} title="Reasoning effort" options={efforts.map((value) => ({ value, label: REASONING_LABELS[value] }))} onChange={(value: ReasoningEffort) => update({ reasoningEnabled: true, reasoningEffort: value })} className="mt-1" />
              ) : null}
              {reasoningSupport?.defaultValue ? <Text variant="caption" className="mt-1.5">Gateway default: {REASONING_LABELS[reasoningSupport.defaultValue]}</Text> : null}
            </>
          ) : (
            <View className="rounded-md border border-border bg-muted/40 px-3 py-2.5"><Text variant="caption">This model reports no selectable reasoning levels.</Text></View>
          )}
        </Field>

        <Field label="Provider">
          {routes.length ? (
            <Select
              value={providerId}
              title="Provider"
              options={providerOptions}
              onChange={(next) => {
                const nextTiers = serviceTierOptions(modelServiceTierSupport(routes, next));
                update({ providerId: next, ...(form.serviceTier && !nextTiers.includes(form.serviceTier) ? { serviceTier: "standard" as const } : {}) });
              }}
            />
          ) : (
            <View className="rounded-md border border-border bg-muted/40 px-3 py-2.5"><Text variant="caption">Phaseo routes this model for you.</Text></View>
          )}
        </Field>

        {tiers.length > 1 ? (
          <Field label="Service tier">
            <Select
              value={tier}
              title="Service tier"
              options={tiers.map((value) => ({ value, label: SERVICE_TIER_LABELS[value], leading: tierIcon(value) }))}
              onChange={(serviceTier: ServiceTier) => update({ serviceTier })}
            />
          </Field>
        ) : null}

        <Divider className="mx-4 mt-6" />

        <Field label="System prompt" detail={`~${Math.ceil((form.systemPrompt?.length ?? 0) / CHARS_PER_TOKEN).toLocaleString("en-GB")} tokens`}>
          <TextField value={form.systemPrompt ?? ""} onChangeText={(systemPrompt) => update({ systemPrompt })} multiline textAlignVertical="top" placeholder="Instructions this model follows in this chat" className="max-h-56 min-h-24" accessibilityLabel="System prompt" />
        </Field>

        <NumberSetting settingKey="temperature" value={form.temperature ?? null} onChange={(temperature) => update({ temperature })} />
        <NumberSetting settingKey="maxOutputTokens" value={form.maxOutputTokens ?? null} onChange={(maxOutputTokens) => update({ maxOutputTokens })} />

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: advancedOpen }} onPress={() => setAdvancedOpen(!advancedOpen)} className="mx-2 mt-5 min-h-11 flex-row items-center gap-1.5 rounded-md px-2 active:bg-accent">
          <Icon icon={advancedOpen ? ChevronDown : ChevronRight} tone="muted" size={16} />
          <Text variant="label">Advanced</Text>
          <Text variant="caption" className="ml-1">Top P, Top K, Min P, Top A</Text>
        </Pressable>
        {advancedOpen ? ADVANCED_SETTING_KEYS.map((key) => <NumberSetting key={key} settingKey={key} value={form[key] ?? null} onChange={(value) => update({ [key]: value })} />) : null}

        <View className={split ? "mt-8 flex-row flex-wrap gap-2 px-4" : "mt-8 gap-2 px-4"}>
          <Button label="Reset" icon={RotateCcw} variant="outline" size={split ? "sm" : "md"} onPress={() => void reset()} />
          {models.length > 1 ? <Button label="Apply to all models" icon={CopyAll} variant="outline" size={split ? "sm" : "md"} onPress={applyToAll} /> : null}
          {models.length > 1 ? <Button label="Remove from chat" icon={Trash2} variant="destructive" size={split ? "sm" : "md"} onPress={() => void remove()} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Field({ label, detail, children }: { label: string; detail?: string; children: ReactNode }) {
  return (
    <View className="px-4 pt-4">
      <View className="mb-1.5 flex-row items-center justify-between gap-3">
        <Text variant="label">{label}</Text>
        {detail ? <Text variant="caption">{detail}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** A number with a slider, like the website: blank means the provider's default. */
function NumberSetting({ settingKey, value, onChange }: { settingKey: NumberSettingKey; value: number | null; onChange(value: number | null): void }) {
  const spec = NUMBER_SETTINGS[settingKey];
  const [text, setText] = useState(value == null ? "" : String(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(value == null ? "" : String(value)); }, [value]);
  return (
    <View className="px-4 pt-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text variant="label">{spec.label}</Text>
          <Text variant="caption" className="mt-0.5">{spec.description}</Text>
        </View>
        <TextInput
          value={text}
          onFocus={() => { focused.current = true; }}
          onChangeText={(next) => {
            setText(next);
            const parsed = normaliseNumberSetting(settingKey, next);
            if (parsed != null || !next.trim()) onChange(parsed);
          }}
          onBlur={() => { focused.current = false; setText(value == null ? "" : String(value)); }}
          placeholder={spec.placeholder}
          keyboardType={spec.integer ? "number-pad" : "decimal-pad"}
          accessibilityLabel={spec.label}
          className="h-10 w-24 rounded-md border border-input bg-background px-2.5 text-right font-sans text-[15px] text-foreground"
          placeholderTextColorClassName="accent-muted-foreground"
          cursorColorClassName="accent-primary"
        />
      </View>
      <Slider label={spec.label} value={value} placeholder={spec.resting} min={spec.min} max={spec.sliderMax} step={spec.step} onChange={(next) => setText(String(next))} onCommit={onChange} className="mt-1.5" />
      {value != null ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Use the default ${spec.label.toLowerCase()}`} onPress={() => { setText(""); onChange(null); }} hitSlop={6} className="self-end">
          <Text variant="caption" className="text-link">Use default</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
