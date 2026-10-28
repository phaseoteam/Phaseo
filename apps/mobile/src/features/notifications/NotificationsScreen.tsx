import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { BellOff, LayoutList, ListChecks, Plus, Send } from "lucide-react-native";
import { AppState, Platform, RefreshControl, ScrollView, View } from "react-native";
import { Button, EmptyState, ErrorState, Header, LoadingState, measureAnchor, ReadableWidth, Row, Screen, Section, showActions, Switch, Text, toast, toastError, type ViewRef } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { ApiError } from "@/lib/api/http";
import { createRule, sendTestNotification, updateNotificationSettings, updateRule, type NotificationRule, type NotificationSettings, type SettingsPatch } from "@/lib/api/notifications";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { shownCategories, type Category } from "./channels";
import { DailyCapStepper, QuietHoursChoice } from "./controls";
import { blockedChannels, openChannelSettings, registerForPush, registerThisPhone } from "./device";
import { describeRule, RULE_TEMPLATES } from "./rules";
import { adminWorkspaces, STARTER_RULE } from "./setup";
import { draftRuleStore, takeSetupOffer, useNotificationSettings, useRuleNames } from "./state";

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
  const { workspaces, loading: workspacesLoading } = useWorkspace();
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
        // A first switch-on with no rules would send nothing; start with setup's every new model.
        if (!settings.data?.rules.length) await createRule(STARTER_RULE);
      }
      return updateNotificationSettings(settings.installationId!, { enabled: on });
    },
    onSuccess: async (next, on) => {
      settings.set(next);
      // The first switch-on for this account on this phone carries on into setup.
      if (on && session && (await takeSetupOffer(session.user.id))) router.push("/notification-setup");
    },
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
  // Money, Your traffic and Digest only reach workspace owners and admins. Until the workspaces load, show them all.
  const admin = workspacesLoading || adminWorkspaces(workspaces).length > 0;
  const categoryRows = shownCategories(admin);
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
            trailing={<Switch value={on} disabled={enable.isPending} accessibilityLabel="Notifications on this phone" onValueChange={(value) => enable.mutate(value)} />}
            last
          />
          {/* Up here rather than below the settings, so checking that notifications arrive is one tap after switching them on. */}
          <View className="px-4 pt-3">
            <Button label="Send a test notification" icon={Send} variant="outline" disabled={!on} loading={test.isPending} onPress={() => test.mutate()} />
            <Text variant="caption" className="mt-2">{on ? "Sends one notification to this phone, whatever your rules. Up to 3 every 10 minutes." : "Turn on notifications above to send a test."}</Text>
          </View>

          <Section>
            <Row icon={ListChecks} title="Set up notifications" subtitle="Choose what you hear about, step by step" onPress={() => router.push("/notification-setup")} last />
          </Section>

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
                trailing={<Switch value={rule.enabled} accessibilityLabel={`${rule.name || "Rule"} on`} onValueChange={(enabled) => toggleRule.mutate({ rule, enabled })} />}
                chevron={false}
                last={index === data.rules.length - 1}
              />
            ))}
          </Section>

          {/* Hidden until the server has categories (push v2), rather than showing switches that do nothing. */}
          {data.categories ? (
            <Section title="Categories" description={`Turn off whole kinds of notification. Your rules still choose which model updates arrive.${android ? " Tap a category for its sound and pop-up settings." : ""}`}>
              {categoryRows.map((channel, index) => (
                <Row
                  key={channel.id}
                  title={channel.name}
                  subtitle={blocked.has(channel.id) ? "Off in Android settings. Tap to change." : channel.id === "security" && !admin ? "Only alerts about API keys you created" : channel.description}
                  onPress={android ? () => void openChannelSettings(channel.id) : undefined}
                  chevron={false}
                  trailing={<Switch value={data.categories?.[channel.id] ?? true} accessibilityLabel={channel.name} onValueChange={(on) => setCategory.mutate({ category: channel.id, on })} />}
                  last={index === categoryRows.length - 1}
                />
              ))}
              {!admin ? <Text variant="caption" className="px-4 pt-2">Money, Your traffic and Digest are only for workspace owners and admins.</Text> : null}
            </Section>
          ) : null}

          <Section title="Quiet hours" description="Notifications wait until quiet hours end, in this phone's time zone.">
            <QuietHoursChoice value={data.quietHours ?? null} onChange={(quietHours) => update.mutate({ quietHours })} />
          </Section>

          <Section title="Daily limit" description="After this many notifications in a day, the rest are skipped.">
            <DailyCapStepper value={data.dailyCap} onChange={(dailyCap) => update.mutate({ dailyCap })} />
          </Section>
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
