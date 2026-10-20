import { useMutation, useQueries } from "@tanstack/react-query";
import { useFocusEffect, usePreventRemove, useRouter } from "expo-router";
import { Check, Send, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, ScrollView, View } from "react-native";
import { Button, confirm, DialogFrame, EmptyState, ErrorState, Header, Icon, IconButton, LoadingState, ReadableWidth, Row, Screen, Section, Switch, switchHaptic, Text, toast, toastError, type ViewRef } from "@/components/ui";
import { accountKeys } from "@/features/account/queries";
import { useLayout } from "@/hooks/useLayout";
import { getCredits, type Workspace } from "@/lib/api/account";
import { createRule, deleteRule, getNotificationSettings, sendTestNotification, updateNotificationSettings, updateRule, type NotificationSettings } from "@/lib/api/notifications";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { DailyCapStepper, QuietHoursChoice } from "./controls";
import { modelLab, PickedChips } from "./RuleEditor";
import { EMPTY_RULE } from "./rules";
import { adminWorkspaces, applySetupPlan, choicesFrom, describeChoices, lowBalanceThreshold, normalizeChoices, planIsEmpty, planSetup, sameChoices, setupSteps, skipStep, splitRules, type ModelNews, type SetupChoices, type SetupStep } from "./setup";
import { draftRuleStore, useNotificationSettings, useRuleNames } from "./state";

const STEP_TEXT: Record<SetupStep, { title: string; intro?: string }> = {
  news: { title: "Model news", intro: "Which new models do you want to hear about?" },
  prices: { title: "Prices and deprecations", intro: "Changes to models that are already out." },
  workspaces: { title: "Your workspaces", intro: "These alerts only go to workspace owners and admins." },
  digest: { title: "Your Phaseo week", intro: "A short summary of last week across your workspaces: spend, requests and the top model." },
  quiet: { title: "Quiet hours and daily limit" },
  summary: { title: "Summary", intro: "Tap a line to change it." },
};

const NEWS_OPTIONS: { value: ModelNews; label: string; description?: string }[] = [
  { value: "all", label: "Every new model", description: "From any lab" },
  { value: "labs", label: "Only labs I choose", description: "New models from the labs you pick" },
  { value: "models", label: "Only models I follow", description: "New providers for the models you pick" },
  { value: "none", label: "No model news" },
];

const capitalise = (value: string) => value.replace(/^\w/, (letter) => letter.toUpperCase());

/** Phones get the whole screen; tablets a centred dialog, like the app's other sheets there. */
function SetupFrame({ onClose, children }: { onClose(): void; children: ReactNode }) {
  const { split } = useLayout();
  if (split) return <DialogFrame size="tall" onClose={onClose}>{children}</DialogFrame>;
  return <Screen edges={["top", "bottom"]}>{children}</Screen>;
}

/** Notification setup, step by step. Opens after the first switch-on, and from Notifications → Set up notifications. */
export function NotificationSetup() {
  const router = useRouter();
  const { session } = useAuth();
  const settings = useNotificationSettings();
  const { workspaces, loading } = useWorkspace();
  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace("/account/notifications")), [router]);
  if (session && settings.data && settings.installationId && !loading) {
    return <Walkthrough settings={settings.data} installationId={settings.installationId} workspaces={workspaces} onSaved={() => void settings.refetch()} close={close} />;
  }
  return (
    <SetupFrame onClose={close}>
      <Header leading={<IconButton icon={X} label="Close setup" onPress={close} />} title="Set up notifications" />
      {!session ? <EmptyState className="flex-1" title="Sign in for notifications" /> : settings.isError ? <ErrorState error={settings.error} onRetry={() => void settings.refetch()} /> : <LoadingState />}
    </SetupFrame>
  );
}

function Walkthrough({ settings, installationId, workspaces, onSaved, close }: { settings: NotificationSettings; installationId: string; workspaces: Workspace[]; onSaved(): void; close(): void }) {
  const router = useRouter();
  const names = useRuleNames();
  const admins = useMemo(() => adminWorkspaces(workspaces), [workspaces]);
  // Workspace alerts and the digest are categories, which servers before push v2 don't have.
  const admin = admins.length > 0 && Boolean(settings.categories);
  const steps = setupSteps(admin);
  const [initial] = useState(() => choicesFrom(settings));
  const [choices, setChoices] = useState(initial);
  const [position, setPosition] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const index = Math.min(position, steps.length - 1);
  const step = steps[index]!;
  const dirty = !sameChoices(choices, initial);
  const ownRules = useMemo(() => splitRules(settings.rules).custom.length, [settings.rules]);
  const set = (patch: Partial<SetupChoices>) => setChoices((current) => ({ ...current, ...patch }));

  const credits = useQueries({ queries: admins.map((workspace) => ({ queryKey: accountKeys.credits(workspace.id), queryFn: () => getCredits(workspace.id), staleTime: 60_000, enabled: admin })) });
  const thresholds = credits.map((query) => (query.data ? formatUsd(lowBalanceThreshold(query.data.lowBalanceEmailThresholdUsd)) : null));
  // One figure when every workspace has the same threshold; otherwise each workspace's row shows its own.
  const lowBalance = thresholds.length && thresholds.every((value) => value && value === thresholds[0]) ? thresholds[0]! : null;

  // The lab and model pickers edit the draft rule (see PickSheet); setup reads the picks back when it's in front again.
  const picking = useRef<"labs" | "models" | null>(null);
  useFocusEffect(useCallback(() => {
    const kind = picking.current;
    const draft = draftRuleStore.get();
    picking.current = null;
    if (!kind || !draft) return;
    setChoices((current) => (kind === "labs" ? { ...current, labs: draft.labs.ids } : { ...current, models: draft.models }));
  }, []));
  const seeded = useRef(false);
  const pick = (kind: "labs" | "models") => {
    draftRuleStore.set({ ...EMPTY_RULE, labs: { mode: "only", ids: choices.labs }, models: choices.models });
    seeded.current = true;
    picking.current = kind;
    router.push({ pathname: "/sheets/[kind]", params: { kind: "pick", type: kind } });
  };
  // Like the rule templates: an option that needs picks opens its picker straight away.
  const chooseNews = (modelNews: ModelNews) => {
    set({ modelNews });
    if (modelNews === "labs" && !choices.labs.length) pick("labs");
    if (modelNews === "models" && !choices.models.length) pick("models");
  };

  const save = useMutation({
    mutationFn: async () => {
      // Planned against the server's state now, so finishing twice, or after a change on another phone, writes each thing once.
      const latest = await getNotificationSettings(installationId);
      const plan = planSetup(choices, latest, admin);
      await applySetupPlan(plan, { createRule, updateRule, deleteRule, updateSettings: (patch) => updateNotificationSettings(installationId, patch) });
      return plan;
    },
    onSuccess: (plan) => {
      onSaved();
      if (!planIsEmpty(plan)) toast("Your choices are saved.", { tone: "success", title: "Notifications set up" });
      exit();
    },
    onError: (error) => {
      onSaved();
      toastError("Couldn't save your choices", error);
    },
  });
  const test = useMutation({
    mutationFn: () => sendTestNotification(installationId),
    onSuccess: () => toast("A test notification is on its way to this phone.", { tone: "success", title: "Sent" }),
    onError: (error) => toastError("Couldn't send a test", error),
  });

  // The system Back steps back through setup, then leaves it like Close does.
  const disablePrevention = usePreventRemove(!leaving && (index > 0 || dirty), () => {
    if (index > 0) setPosition(index - 1);
    else void leave();
  });
  function exit() {
    setLeaving(true);
    disablePrevention();
    // The draft held setup's picks, not a rule being edited.
    if (seeded.current) draftRuleStore.set(null);
    close();
  }
  // Leaving saves nothing, so it asks first when that would lose a change.
  async function leave() {
    if (save.isPending) return;
    if (dirty && !(await confirm({ title: "Leave setup?", body: "Nothing you chose here will be saved.", confirmLabel: "Leave", cancelLabel: "Keep going" }))) return;
    exit();
  }

  // Screen readers start each step at its heading.
  const heading = useRef<ViewRef>(null);
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    if (heading.current) AccessibilityInfo.sendAccessibilityEvent(heading.current, "focus");
  }, [step]);

  const normal = normalizeChoices(choices);
  const follows = normal.modelNews === "models";
  const problem = step !== "news" ? null : choices.modelNews === "labs" && !choices.labs.length ? "Choose at least one lab." : choices.modelNews === "models" && !choices.models.length ? "Choose at least one model." : null;
  const ownRulesNote = ownRules ? `You have ${ownRules} rule${ownRules === 1 ? "" : "s"} of your own. Setup keeps ${ownRules === 1 ? "it" : "them"} as ${ownRules === 1 ? "it is" : "they are"}.` : null;
  const text = STEP_TEXT[step];

  const content = (() => {
    switch (step) {
      case "news":
        return (
          <>
            <View accessibilityRole="radiogroup" accessibilityLabel="Model news" className="mt-4">
              {NEWS_OPTIONS.map((option, position) => (
                <Choice key={option.value} label={option.label} description={option.description} checked={choices.modelNews === option.value} onPress={() => chooseNews(option.value)} last={position === NEWS_OPTIONS.length - 1}>
                  {option.value === "labs" ? (
                    <Picks label={choices.labs.length ? "Change labs" : "Choose labs"} onPick={() => pick("labs")}>
                      <PickedChips className="px-0 pt-0" ids={choices.labs} name={names.lab} logo={(id) => id} onRemove={(id) => set({ labs: choices.labs.filter((entry) => entry !== id) })} />
                    </Picks>
                  ) : option.value === "models" ? (
                    <Picks label={choices.models.length ? "Change models" : "Choose models"} onPick={() => pick("models")}>
                      <PickedChips className="px-0 pt-0" ids={choices.models} name={names.model} logo={modelLab} onRemove={(id) => set({ models: choices.models.filter((entry) => entry !== id) })} />
                    </Picks>
                  ) : null}
                </Choice>
              ))}
            </View>
            {problem ? <Text variant="small" accessibilityLiveRegion="polite" className="px-4 pt-2 text-destructive">{problem}</Text> : null}
            <Section>
              <Toggle title="Also when a model becomes available on Phaseo" subtitle="When you can start calling it through Phaseo" value={normal.alsoAvailable} disabled={choices.modelNews === "none"} onChange={(alsoAvailable) => set({ alsoAvailable })} last />
            </Section>
            {ownRulesNote ? <Text variant="caption" className="px-4 pt-4">{ownRulesNote}</Text> : null}
          </>
        );
      case "prices":
        return (
          <>
            <Section className="mt-4">
              <Toggle title={follows ? "Price changes for models I follow" : "Price changes on Phaseo"} subtitle={follows ? "When a provider changes what it charges" : "Any model you can call through Phaseo"} value={choices.prices} onChange={(prices) => set({ prices })} />
              <Toggle title="Deprecations and retirements" subtitle={follows ? "For models you follow" : "For models on Phaseo"} value={choices.deprecations} onChange={(deprecations) => set({ deprecations })} last />
            </Section>
            {admin ? <Text variant="caption" className="px-4 pt-3">Deprecation alerts for models your workspaces use come either way.</Text> : null}
          </>
        );
      case "workspaces":
        return (
          <>
            <Section title={admins.length === 1 ? "Workspace" : "Workspaces"} className="mt-4">
              {admins.map((workspace, position) => (
                <Row
                  key={workspace.id}
                  title={workspace.name ?? "Workspace"}
                  subtitle={[workspace.role ? capitalise(String(workspace.role)) : null, thresholds[position] ? `Low balance below ${thresholds[position]}` : null].filter(Boolean).join(" · ") || null}
                  last={position === admins.length - 1}
                />
              ))}
            </Section>
            <Section title="Alerts">
              <Toggle title="Money" subtitle={`${lowBalance ? `Balance below ${lowBalance}` : "Low balance"}, failed top-ups and budgets`} value={choices.money} onChange={(money) => set({ money })} />
              <Toggle title="Security" subtitle="API key activity and leaked keys" value={choices.security} onChange={(security) => set({ security })} />
              <Toggle title="Your traffic" subtitle="Rate limits and model substitutions" value={choices.traffic} onChange={(traffic) => set({ traffic })} last />
            </Section>
          </>
        );
      case "digest":
        return (
          <Section className="mt-4">
            <Toggle title="Your Phaseo week" subtitle="Sundays at 18:00 in this phone's time zone, without sound" value={choices.digest} onChange={(digest) => set({ digest })} last />
          </Section>
        );
      case "quiet":
        return (
          <>
            <Section title="Quiet hours" description="Notifications wait until quiet hours end. Leaked-key alerts still come straight away." className="mt-4">
              <QuietHoursChoice value={choices.quietHours} onChange={(quietHours) => set({ quietHours })} />
            </Section>
            <Section title="Daily limit" description={admin ? "For model news, prices and deprecations. Workspace alerts and your week don't count." : "For model news, prices and deprecations."}>
              <DailyCapStepper value={choices.dailyCap} onChange={(dailyCap) => set({ dailyCap })} />
            </Section>
          </>
        );
      case "summary": {
        const lines = describeChoices(choices, { admin, lab: names.lab, model: names.model, lowBalance });
        const on = settings.enabled && settings.deviceRegistered;
        return (
          <>
            <Section className="mt-4">
              {lines.map((line, position) => <Row key={line.title} title={line.title} subtitle={line.detail} onPress={() => setPosition(steps.indexOf(line.step))} last={position === lines.length - 1} />)}
            </Section>
            <Text variant="caption" className="px-4 pt-3">
              {`Setup only changes its own rules, named "Setup: …".${ownRules ? ` Your ${ownRules === 1 ? "other rule is" : `${ownRules} other rules are`} kept as ${ownRules === 1 ? "it is" : "they are"}.` : " Rename one to make it your own."}`}
            </Text>
            <View className="px-4 pt-6">
              <Button label="Send a test notification" icon={Send} variant="outline" disabled={!on} loading={test.isPending} onPress={() => test.mutate()} />
              <Text variant="caption" className="mt-2">{on ? "Sends one to this phone now, whatever you chose. Up to 3 every 10 minutes." : "Turn on notifications for this phone to send a test."}</Text>
            </View>
          </>
        );
      }
    }
  })();

  return (
    <SetupFrame onClose={() => void leave()}>
      <Header leading={<IconButton icon={X} label="Close setup" onPress={() => void leave()} />} title="Set up notifications" />
      <Progress count={steps.length} index={index} />
      <ScrollView key={step} className="flex-1" contentContainerClassName="pb-8" keyboardShouldPersistTaps="handled">
        <ReadableWidth>
          <View ref={heading} accessible accessibilityRole="header" className="px-4 pt-4">
            <Text variant="caption">{`Step ${index + 1} of ${steps.length}`}</Text>
            <Text variant="title" className="mt-1">{text.title}</Text>
          </View>
          {text.intro ? <Text variant="muted" className="px-4 pt-1">{text.intro}</Text> : null}
          {content}
        </ReadableWidth>
      </ScrollView>
      <View className="flex-row items-center gap-2 border-t border-border px-4 py-3">
        <Button label="Back" variant="outline" disabled={save.isPending} accessibilityHint={index === 0 ? "Leaves setup" : undefined} onPress={() => (index === 0 ? void leave() : setPosition(index - 1))} />
        <View className="flex-1" />
        {step === "summary" ? (
          <Button label="Done" loading={save.isPending} accessibilityHint="Saves your choices" onPress={() => save.mutate()} />
        ) : (
          <>
            <Button label="Skip" variant="ghost" accessibilityHint="Keeps this step as it was" onPress={() => { setChoices((current) => skipStep(current, initial, step)); setPosition(index + 1); }} />
            <Button label="Next" disabled={Boolean(problem)} onPress={() => setPosition(index + 1)} />
          </>
        )}
      </View>
    </SetupFrame>
  );
}

/** Thin step segments under the header; the heading says "Step 2 of 6" for screen readers. */
function Progress({ count, index }: { count: number; index: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="flex-row gap-1 px-4 pb-1">
      {Array.from({ length: count }, (_, position) => <View key={position} className={cn("h-[3px] flex-1 rounded-[1px]", position <= index ? "bg-primary" : "bg-muted")} />)}
    </View>
  );
}

/** One option of a choice, with its own picks under it while chosen. */
function Choice({ label, description, checked, onPress, last, children }: { label: string; description?: string; checked: boolean; onPress(): void; last?: boolean; children?: ReactNode }) {
  const open = checked && Boolean(children);
  return (
    <View>
      <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityHint={description} accessibilityState={{ checked }} onPress={onPress} className="flex-row items-center gap-3 pl-4 pr-3 active:bg-accent">
        <View className={cn("h-5 w-5 items-center justify-center rounded-[4px] border", checked ? "border-primary bg-primary" : "border-border")}>
          {checked ? <Icon icon={Check} tone="primary-foreground" size={14} /> : null}
        </View>
        <View className={cn("min-h-[52px] flex-1 justify-center py-3", !last && !open && "border-b border-border")}>
          <Text variant="body" className={cn(checked && "font-semibold")}>{label}</Text>
          {description ? <Text variant="caption" className="mt-0.5">{description}</Text> : null}
        </View>
      </Pressable>
      {open ? <View className={cn("ml-12 pb-3 pr-4", !last && "border-b border-border")}>{children}</View> : null}
    </View>
  );
}

function Picks({ label, onPick, children }: { label: string; onPick(): void; children: ReactNode }) {
  return (
    <View className="gap-2">
      {children}
      <Button label={label} variant="outline" size="sm" className="self-start" onPress={onPick} />
    </View>
  );
}

/** A row that is one switch: tapping anywhere on it toggles, and screen readers hear a single control. */
function Toggle({ title, subtitle, value, onChange, disabled, last }: { title: string; subtitle?: string; value: boolean; onChange(value: boolean): void; disabled?: boolean; last?: boolean }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={title} accessibilityHint={subtitle} accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={() => { switchHaptic(); onChange(!value); }} className={cn("flex-row items-center pl-4 pr-3 active:bg-accent", disabled && "opacity-50")}>
      <View className={cn("min-h-[52px] flex-1 flex-row items-center gap-3 py-3", !last && "border-b border-border")}>
        <View className="flex-1">
          <Text variant="body">{title}</Text>
          {subtitle ? <Text variant="caption" className="mt-0.5">{subtitle}</Text> : null}
        </View>
        {/* Only a picture of the state: the row takes every tap (and dims itself when disabled). */}
        <View pointerEvents="none">
          <Switch value={value} focusable={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        </View>
      </View>
    </Pressable>
  );
}
