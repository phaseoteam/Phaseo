import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { BellOff, LayoutList, Minus, Plus, Send } from "lucide-react-native";
import { AppState, Platform, Pressable, RefreshControl, ScrollView, Switch, View } from "react-native";
import { Button, EmptyState, ErrorState, Header, Icon, LoadingState, measureAnchor, ReadableWidth, Row, Screen, Section, showActions, Text, toast, toastError, type ViewRef } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { ApiError } from "@/lib/api/http";
import { createRule, sendTestNotification, updateNotificationSettings, updateRule, type NotificationRule, type NotificationSettings, type SettingsPatch } from "@/lib/api/notifications";
import { useAuth } from "@/providers/AuthProvider";
import { CATEGORY_CHANNELS, type Category } from "./channels";
import { blockedChannels, openChannelSettings, registerForPush, registerThisPhone } from "./device";
import { describeRule, EMPTY_RULE, RULE_TEMPLATES } from "./rules";
import { draftRuleStore, useNotificationSettings, useRuleNames } from "./state";

const QUIET_PRESETS = [{ start: "22:00", end: "07:00" }, { start: "23:00", end: "08:00" }, { start: "21:00", end: "09:00" }];
// Settings writes run one at a time, and only the last response is applied, so quick taps don't flicker back.
const SETTINGS_WRITE = { mutationKey: ["notification-settings-write"], scope: { id: "notification-settings-write" } };

/** Channels switched off in Android's own settings, read again whenever the user comes back to the app. */
function useBlockedChannels(active: boolean) {
  const [blocked, setBlocked] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!active) return;
    const read = () => void blockedChannels().then(setBlocked).catch(() => undefined);
    read();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") read(); });
    return () => subscription.remove();
  }, [active]);
  return blocked;
}

export function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { split } = useLayout();
  const { session } = useAuth();
  const settings = useNotificationSettings();
  const names = useRuleNames();
  const addRef = useRef<ViewRef>(null);
  const android = Platform.OS === "android";
  const blocked = useBlockedChannels(android && Boolean(settings.data?.categories));

  const enable = useMutation({
    mutationFn: async (on: boolean) => {
      if (on) {
        const device = await registerForPush();
        // Servers that return categories take channel scheme 2; older ones get the old registration.
        await registerThisPhone(session!.user.id, device, Boolean(settings.data?.categories));
        // A first switch-on with no rules would send nothing; start with every new model.
        if (!settings.data?.rules.length) await createRule({ ...EMPTY_RULE, name: "Every new model" });
      }
      return updateNotificationSettings(settings.installationId!, { enabled: on });
    },
    onSuccess: settings.set,
    onError: (error) => toastError("Couldn't turn on notifications", error),
  });
  const applyLatest = (next: NotificationSettings) => {
    // This write is still counted; anything more is queued behind it and will answer with newer settings.
    if (queryClient.isMutating({ mutationKey: SETTINGS_WRITE.mutationKey }) <= 1) settings.set(next);
  };
  const update = useMutation({ ...SETTINGS_WRITE, mutationFn: (patch: SettingsPatch) => updateNotificationSettings(settings.installationId!, patch), onSuccess: applyLatest });
  const setCategory = useMutation({
    ...SETTINGS_WRITE,
    mutationFn: ({ category, on }: { category: Category; on: boolean }) => updateNotificationSettings(settings.installationId!, { categories: { [category]: on } }),
    onMutate: ({ category, on }) => settings.patch((current) => (current.categories ? { ...current, categories: { ...current.categories, [category]: on } } : current)),
    onSuccess: applyLatest,
    onError: (error) => {
      void settings.refetch();
      toastError("Couldn't change that category", error);
    },
  });
  const toggleRule = useMutation({
    mutationFn: ({ rule, enabled }: { rule: NotificationRule; enabled: boolean }) => updateRule(rule.id, { enabled }),
    onSuccess: () => void settings.refetch(),
  });
  const test = useMutation({
    mutationFn: () => sendTestNotification(settings.installationId!),
    onSuccess: () => toast("A test notification is on its way to this phone.", { tone: "success", title: "Sent" }),
    onError: (error) => toastError("Couldn't send a test", error),
  });

  if (!session) {
    return (
      <Screen>
        <Header back={!split} title="Notifications" />
        <EmptyState className="flex-1" icon={BellOff} title="Sign in for notifications" body="Get told about new models, price changes and deprecations, filtered by your own rules." action="Sign in" onAction={() => router.push("/sign-in")} />
      </Screen>
    );
  }
  if (settings.isLoading || !settings.installationId) return <Screen><Header back={!split} title="Notifications" /><LoadingState /></Screen>;
  if (settings.isError) {
    const missing = settings.error instanceof ApiError && settings.error.status === 404;
    return (
      <Screen>
        <Header back={!split} title="Notifications" />
        {missing ? <EmptyState className="flex-1" icon={BellOff} title="Coming soon" body="Phaseo's notification service isn't live yet. This screen will work once it is." /> : <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />}
      </Screen>
    );
  }

  const data = settings.data!;
  const on = data.enabled && data.deviceRegistered;
  const openRule = (rule?: NotificationRule, template?: (typeof RULE_TEMPLATES)[number]) => {
    draftRuleStore.set(rule ? { ...rule } : { ...template!.rule });
    router.push({ pathname: "/account/rule", params: { id: rule?.id ?? "new", pick: template?.pick } });
  };
  // Templates in a menu under Add (a bottom panel on phones); the full list is one more tap away.
  const addRule = async () => showActions({
    title: "Start from a template",
    anchor: await measureAnchor(addRef),
    actions: [
      ...RULE_TEMPLATES.slice(0, 4).map((template) => ({ key: template.key, label: template.title, description: template.description, onPress: () => openRule(undefined, template) })),
      { key: "more", label: "All templates", icon: LayoutList, onPress: () => router.push({ pathname: "/account/rule-templates" }) },
    ],
  });

  return (
    <Screen>
      <Header back={!split} title="Notifications" />
      <ScrollView contentContainerClassName="pb-16" refreshControl={<RefreshControl refreshing={settings.isRefetching} onRefresh={() => void settings.refetch()} />}>
        <ReadableWidth>
          <Row
            title="Notifications on this phone"
            subtitle={on ? "On. Only updates that match your rules are sent." : data.enabled ? "On for your account, but this phone isn't registered." : "Off"}
            chevron={false}
            trailing={<Switch value={on} disabled={enable.isPending} onValueChange={(value) => enable.mutate(value)} trackColorOnClassName="accent-primary" />}
            last
          />
          {/* Up here rather than below the settings, so checking that notifications arrive is one tap after switching them on. */}
          <View className="px-4 pt-3">
            <Button label="Send a test notification" icon={Send} variant="outline" disabled={!on} loading={test.isPending} onPress={() => test.mutate()} />
            <Text variant="caption" className="mt-2">{on ? "Sends one notification to this phone, whatever your rules. Up to 3 every 10 minutes." : "Turn on notifications above to send a test."}</Text>
          </View>

          <Section title="Rules" description="You get a notification when any rule matches and no mute rule does." action={<View ref={addRef} collapsable={false}><Button label="Add" icon={Plus} variant="ghost" size="sm" onPress={() => void addRule()} /></View>}>
            {data.rules.length === 0 ? (
              <View className="px-4 py-3">
                <Text variant="muted">No rules yet, so nothing will be sent.</Text>
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {RULE_TEMPLATES.slice(0, 3).map((template) => <Button key={template.key} label={template.title} variant="outline" size="sm" onPress={() => openRule(undefined, template)} />)}
                </View>
              </View>
            ) : data.rules.map((rule, index) => (
              <Row
                key={rule.id}
                title={rule.name || (rule.action === "mute" ? "Mute" : "Rule")}
                subtitle={describeRule(rule, names)}
                numberOfLines={1}
                onPress={() => openRule(rule)}
                trailing={<Switch value={rule.enabled} onValueChange={(enabled) => toggleRule.mutate({ rule, enabled })} trackColorOnClassName="accent-primary" />}
                chevron={false}
                last={index === data.rules.length - 1}
              />
            ))}
          </Section>

          {/* Hidden until the server has categories (push v2), rather than showing switches that do nothing. */}
          {data.categories ? (
            <Section title="Categories" description={`Turn off whole kinds of notification. Your rules still choose which model updates arrive.${android ? " Tap a category for its sound and pop-up settings." : ""}`}>
              {CATEGORY_CHANNELS.map((channel, index) => (
                <Row
                  key={channel.id}
                  title={channel.name}
                  subtitle={blocked.has(channel.id) ? "Off in Android settings. Tap to change." : channel.description}
                  onPress={android ? () => void openChannelSettings(channel.id) : undefined}
                  chevron={false}
                  trailing={<Switch value={data.categories?.[channel.id] ?? true} onValueChange={(on) => setCategory.mutate({ category: channel.id, on })} trackColorOnClassName="accent-primary" />}
                  last={index === CATEGORY_CHANNELS.length - 1}
                />
              ))}
            </Section>
          ) : null}

          <Section title="Quiet hours" description="Notifications wait until quiet hours end, in this phone's time zone.">
            <View className="flex-row flex-wrap gap-2 px-4 pt-1">
              <Button label="Off" size="sm" variant={!data.quietHours ? "primary" : "outline"} onPress={() => update.mutate({ quietHours: null })} />
              {QUIET_PRESETS.map((preset) => {
                const active = data.quietHours?.start === preset.start && data.quietHours?.end === preset.end;
                return <Button key={preset.start} label={`${preset.start}–${preset.end}`} size="sm" variant={active ? "primary" : "outline"} onPress={() => update.mutate({ quietHours: preset })} />;
              })}
            </View>
          </Section>

          <Section title="Daily limit" description="After this many notifications in a day, the rest are skipped.">
            <View className="flex-row items-center gap-4 px-4 pt-2">
              <Stepper icon={Minus} label="Fewer" disabled={data.dailyCap <= 1} onPress={() => update.mutate({ dailyCap: Math.max(1, data.dailyCap - (data.dailyCap > 10 ? 5 : 1)) })} />
              <Text variant="title" className="min-w-12 text-center">{data.dailyCap}</Text>
              <Stepper icon={Plus} label="More" disabled={data.dailyCap >= 100} onPress={() => update.mutate({ dailyCap: Math.min(100, data.dailyCap + (data.dailyCap >= 10 ? 5 : 1)) })} />
              <Text variant="muted">a day</Text>
            </View>
          </Section>
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}

function Stepper({ icon, label, disabled, onPress }: { icon: typeof Plus; label: string; disabled?: boolean; onPress(): void }) {
  return (
    <Pressable accessibilityLabel={label} disabled={disabled} onPress={onPress} className="h-10 w-10 items-center justify-center rounded-md border border-border active:bg-accent disabled:opacity-40">
      <Icon icon={icon} size={18} />
    </Pressable>
  );
}
