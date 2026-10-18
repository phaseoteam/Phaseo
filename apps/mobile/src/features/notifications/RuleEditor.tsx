import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, Switch, View } from "react-native";
import { Button, Chip, confirm, Header, Icon, ReadableWidth, Row, Screen, Section, Segmented, Text, TextField, toastError } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { createRule, deleteRule, EVENT_KINDS, updateRule, type RuleInput, type ScopeMode } from "@/lib/api/notifications";
import { cn } from "@/lib/cn";
import { modalityLabel } from "@/lib/format";
import { describeRule, EVENT_LABELS, RULE_TEMPLATES, validateRule } from "./rules";
import { draftRuleStore, useNotificationSettings, useRuleNames } from "./state";

const MODALITIES = ["text", "image", "audio", "video"];
const SCOPES: { value: ScopeMode; label: string }[] = [{ value: "all", label: "Any" }, { value: "only", label: "Only these" }, { value: "except", label: "All except" }];

function patchDraft(patch: Partial<RuleInput>) {
  draftRuleStore.set((current) => (current ? { ...current, ...patch } : current));
}

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

export function RuleEditor() {
  const router = useRouter();
  const { split } = useLayout();
  const { id, pick } = useLocalSearchParams<{ id: string; pick?: string }>();
  const draft = draftRuleStore.use();
  const names = useRuleNames();
  const settings = useNotificationSettings();
  const opened = useRef(false);
  const isNew = id === "new";

  // Templates that need a choice (labs, models) open that picker straight away.
  useEffect(() => {
    if (opened.current || !pick || !draft) return;
    opened.current = true;
    router.push({ pathname: "/sheets/[kind]", params: { kind: "pick", type: pick } });
  }, [pick, draft, router]);

  const save = useMutation({
    mutationFn: (rule: RuleInput) => (isNew ? createRule(rule) : updateRule(id, rule)),
    onSuccess: () => { void settings.refetch(); router.back(); },
    onError: (error) => toastError("Couldn't save the rule", error),
  });
  const remove = useMutation({
    mutationFn: () => deleteRule(id),
    onSuccess: () => { void settings.refetch(); router.back(); },
  });

  if (!draft) {
    return (
      <Screen>
        <Header back={!split} title="Rule" />
        <Text variant="muted" className="px-4">Open a rule from Notifications.</Text>
      </Screen>
    );
  }

  const problem = validateRule(draft);
  return (
    <Screen>
      <Header back title={isNew ? "New rule" : "Edit rule"} right={<Button label="Save" size="sm" disabled={Boolean(problem)} loading={save.isPending} onPress={() => save.mutate(draft)} />} />
      <ScrollView contentContainerClassName="pb-16" keyboardShouldPersistTaps="handled">
        <ReadableWidth>
          <View className="px-4">
            <Text variant="body" className="font-semibold">{describeRule(draft, names)}</Text>
            {problem ? <Text variant="small" className="mt-1 text-destructive">{problem}</Text> : null}
          </View>

          <Section title="Name" className="mt-5">
            <View className="px-4"><TextField value={draft.name ?? ""} onChangeText={(name) => patchDraft({ name: name || null })} placeholder="Optional, e.g. Frontier labs" /></View>
          </Section>

          <Section title="This rule">
            <View className="px-4">
              <Segmented<"notify" | "mute"> value={draft.action} onChange={(action) => patchDraft({ action })} options={[{ value: "notify", label: "Notifies me" }, { value: "mute", label: "Mutes" }]} />
              {draft.action === "mute" ? <Text variant="caption" className="mt-1.5">Mute rules win: anything they match is never sent.</Text> : null}
            </View>
          </Section>

          <Section title="Updates">
            {EVENT_KINDS.map((event, index) => (
              <Row
                key={event}
                title={EVENT_LABELS[event].title}
                subtitle={EVENT_LABELS[event].description}
                chevron={false}
                trailing={<Switch value={draft.events.includes(event)} onValueChange={() => patchDraft({ events: toggle(draft.events, event) as RuleInput["events"] })} trackColorOnClassName="accent-primary" />}
                last={index === EVENT_KINDS.length - 1}
              />
            ))}
          </Section>

          <ScopeSection
            title="Labs"
            mode={draft.labs.mode}
            ids={draft.labs.ids}
            name={names.lab}
            disabled={draft.models.length > 0}
            disabledNote="Specific models are chosen below, so labs don't apply."
            onMode={(mode) => patchDraft({ labs: { ...draft.labs, mode } })}
            onRemove={(value) => patchDraft({ labs: { ...draft.labs, ids: draft.labs.ids.filter((entry) => entry !== value) } })}
            onPick={() => router.push({ pathname: "/sheets/[kind]", params: { kind: "pick", type: "labs" } })}
          />

          <Section title="Models" description={draft.models.length ? undefined : "Any model, unless you pick some."}>
            <Chips ids={draft.models} name={names.model} onRemove={(value) => patchDraft({ models: draft.models.filter((entry) => entry !== value) })} />
            <View className="px-4 pt-2"><Button label={draft.models.length ? "Change models" : "Choose models"} variant="outline" size="sm" className="self-start" onPress={() => router.push({ pathname: "/sheets/[kind]", params: { kind: "pick", type: "models" } })} /></View>
          </Section>

          <ScopeSection
            title="Providers"
            mode={draft.providers.mode}
            ids={draft.providers.ids}
            name={names.provider}
            onMode={(mode) => patchDraft({ providers: { ...draft.providers, mode } })}
            onRemove={(value) => patchDraft({ providers: { ...draft.providers, ids: draft.providers.ids.filter((entry) => entry !== value) } })}
            onPick={() => router.push({ pathname: "/sheets/[kind]", params: { kind: "pick", type: "providers" } })}
          />

          <Section title="Modalities" description="Leave empty for any.">
            <Text variant="caption" className="px-4 pb-1.5">Accepts</Text>
            <View className="flex-row flex-wrap gap-2 px-4">
              {MODALITIES.map((value) => <Chip key={value} label={modalityLabel(value)} selected={draft.inputModalities.includes(value)} onPress={() => patchDraft({ inputModalities: toggle(draft.inputModalities, value) })} />)}
            </View>
            <Text variant="caption" className="px-4 pb-1.5 pt-3">Produces</Text>
            <View className="flex-row flex-wrap gap-2 px-4">
              {MODALITIES.map((value) => <Chip key={value} label={modalityLabel(value)} selected={draft.outputModalities.includes(value)} onPress={() => patchDraft({ outputModalities: toggle(draft.outputModalities, value) })} />)}
            </View>
          </Section>

          <Section title="More">
            <Row title="Only models on Phaseo" subtitle="Skip models you can't call through Phaseo yet" chevron={false} trailing={<Switch value={draft.onlyOnPhaseo} onValueChange={(onlyOnPhaseo) => patchDraft({ onlyOnPhaseo })} trackColorOnClassName="accent-primary" />} />
            <Row title="Include free variants" subtitle="Separate :free listings of the same model" chevron={false} last trailing={<Switch value={draft.includeFreeVariants} onValueChange={(includeFreeVariants) => patchDraft({ includeFreeVariants })} trackColorOnClassName="accent-primary" />} />
          </Section>

          {!isNew ? (
            <View className="px-4 pt-8">
              <Button label="Delete rule" variant="destructive" loading={remove.isPending} onPress={() => void confirm({ title: "Delete this rule?", body: "You'll stop getting notifications from it.", confirmLabel: "Delete", destructive: true }).then((ok) => { if (ok) remove.mutate(); })} />
            </View>
          ) : null}
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}

function ScopeSection({ title, mode, ids, name, onMode, onRemove, onPick, disabled, disabledNote }: { title: string; mode: ScopeMode; ids: string[]; name(id: string): string; onMode(mode: ScopeMode): void; onRemove(id: string): void; onPick(): void; disabled?: boolean; disabledNote?: string }) {
  return (
    <Section title={title}>
      <View className={cn("px-4", disabled && "opacity-50")} pointerEvents={disabled ? "none" : "auto"}>
        <Segmented<ScopeMode> value={mode} onChange={onMode} options={SCOPES} />
      </View>
      {disabled && disabledNote ? <Text variant="caption" className="px-4 pt-1.5">{disabledNote}</Text> : null}
      {mode !== "all" && !disabled ? (
        <>
          <Chips ids={ids} name={name} onRemove={onRemove} />
          <View className="px-4 pt-2"><Button label={ids.length ? `Change ${title.toLowerCase()}` : `Choose ${title.toLowerCase()}`} variant="outline" size="sm" className="self-start" onPress={onPick} /></View>
        </>
      ) : null}
    </Section>
  );
}

function Chips({ ids, name, onRemove }: { ids: string[]; name(id: string): string; onRemove(id: string): void }) {
  if (!ids.length) return null;
  return (
    <View className="flex-row flex-wrap gap-2 px-4 pt-3">
      {ids.map((value) => (
        <Pressable key={value} accessibilityLabel={`Remove ${name(value)}`} onPress={() => onRemove(value)} className="h-8 flex-row items-center gap-1.5 rounded-md bg-muted px-3 active:bg-accent">
          <Text variant="small" className="font-semibold">{name(value)}</Text>
          <Icon icon={X} tone="muted" size={13} />
        </Pressable>
      ))}
    </View>
  );
}

export function RuleTemplates() {
  const router = useRouter();
  return (
    <Screen>
      <Header back title="New rule" />
      <ScrollView>
        <ReadableWidth>
          {RULE_TEMPLATES.map((template, index) => (
            <Row
              key={template.key}
              title={template.title}
              subtitle={template.description}
              onPress={() => {
                draftRuleStore.set({ ...template.rule });
                router.replace({ pathname: "/account/rule", params: { id: "new", pick: template.pick } });
              }}
              last={index === RULE_TEMPLATES.length - 1}
            />
          ))}
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
