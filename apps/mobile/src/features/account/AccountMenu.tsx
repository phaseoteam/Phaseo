import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useFocusEffect, usePathname, useRouter, type Href } from "expo-router";
import {
  Activity, Bell, BookOpen, ChartNoAxesColumn, ExternalLink, FileText, Gamepad2, Gauge, HardDrive, Info, KeyRound, LogOut, MessageSquareText, Palette, Plus, Scale,
  Shield, ShieldAlert, ShieldCheck, Sparkles, UserX, Users, Wallet, type LucideIcon,
} from "lucide-react-native";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Logo, logoUri } from "@/components/Logo";
import { useOpenDetail } from "@/components/shell/SplitStack";
import { Button, confirm, Header, Icon, Row, Screen, Section, Text, toast } from "@/components/ui";
import { readStorageReport } from "@/features/chat/deviceStorage";
import { catalogueQuery } from "@/features/models/state";
import { FULL_VERSION_LABEL, VERSION_LABEL } from "@/lib/appInfo";
import { formatBytes, formatNumber, formatUsd, nanosToUsd } from "@/lib/format";
import { openWeb } from "@/lib/web";
import { useAppearance } from "@/providers/AppearanceProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { buildPool, nextTap, TAPS_TO_UNLOCK, tapMessage, topLabs, type TapCount } from "./higherOrLower";
import { higherOrLowerStore, unlockHigherOrLower } from "./higherOrLowerStore";
import { FALLBACK_LABS, LogoBurst, type BurstLab } from "./LogoBurst";
import { useBalance, useKeys, useStatus, useTeam, useTwoFactor, useWeekSpend } from "./queries";
import { StatusDot } from "./StatusScreen";

const ITEMS = {
  usage: { href: "/account/usage", title: "Usage", icon: ChartNoAxesColumn },
  credits: { href: "/account/credits", title: "Credits & billing", icon: Wallet },
  keys: { href: "/account/keys", title: "API keys", icon: KeyRound },
  members: { href: "/account/workspace", title: "Members", icon: Users },
  privacy: { href: "/account/privacy", title: "Privacy & data", icon: Shield },
  notifications: { href: "/account/notifications", title: "Notifications", icon: Bell },
  appearance: { href: "/account/appearance", title: "Appearance", icon: Palette },
  chats: { href: "/account/chats", title: "Chats on this device", icon: HardDrive },
  status: { href: "/account/status", title: "Status", icon: Activity },
  whatsNew: { href: "/account/whats-new", title: "What's new", icon: Sparkles },
  feedback: { href: "/account/feedback", title: "Send feedback", icon: MessageSquareText },
  licences: { href: "/account/licences", title: "Open source licences", icon: Scale },
  diagnostics: { href: "/account/diagnostics", title: "Diagnostics", icon: Gauge },
  higherOrLower: { href: "/account/higher-or-lower", title: "Higher or lower", icon: Gamepad2 },
} as const satisfies Record<string, { href: Href; title: string; icon: LucideIcon }>;

const roleLabel = (role?: string | null) => (role ? role.replace(/^\w/, (letter) => letter.toUpperCase()) : "Member");

/** A row that opens a page on phaseo.app in the in-app browser. */
function WebRow({ title, subtitle, icon, path, destructive, last }: { title: string; subtitle?: string; icon: LucideIcon; path: string; destructive?: boolean; last?: boolean }) {
  return <Row icon={icon} title={title} subtitle={subtitle} destructive={destructive} chevron={false} trailing={<Icon icon={ExternalLink} tone="muted" size={15} />} onPress={() => void openWeb(path)} last={last} />;
}

export function AccountMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const openDetail = useOpenDetail("/account");
  const { session, signOut } = useAuth();
  const { workspace, workspaceId, workspaces } = useWorkspace();
  const balance = useBalance(session ? workspaceId : null);
  const week = useWeekSpend(session ? workspaceId : null);
  const keys = useKeys(session ? workspaceId : null);
  const team = useTeam(session ? workspaceId : null);
  const twoFactor = useTwoFactor();
  const status = useStatus();
  const [storage, setStorage] = useState<{ chats: number; bytes: number } | null>(null);
  // Chats change in the Chat tab, so the figure is read again whenever the menu comes back into view.
  useFocusEffect(useCallback(() => {
    try {
      const report = readStorageReport();
      setStorage({ chats: report.chats, bytes: report.totalBytes });
    } catch {
      setStorage(null);
    }
  }, []));

  // Seven taps on Version and build unlock Higher or lower, as Android's build number unlocks developer options.
  const queryClient = useQueryClient();
  const unlocked = higherOrLowerStore.use((state) => state.unlocked);
  const { resolved } = useAppearance();
  const taps = useRef<TapCount | null>(null);
  const burstLabs = useRef<{ labs: BurstLab[]; logos: Promise<unknown> } | null>(null);
  // `run` remounts the burst, so a replay starts from the beginning even if the last one is still playing.
  const [burst, setBurst] = useState<{ labs: BurstLab[]; run: number } | null>(null);
  const endBurst = useCallback(() => setBurst(null), []);
  const copyVersion = () => void Clipboard.setStringAsync(FULL_VERSION_LABEL).then(() => toast("Version copied.", { key: "version" }));
  // One toast for the whole sequence: each tap updates it in place rather than stacking another.
  const tapVersion = () => {
    const tap = nextTap(taps.current, Date.now());
    taps.current = tap;
    if (tap.count < TAPS_TO_UNLOCK) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      if (tap.count === 3) {
        // Get the game's catalogue (usually cached) and the celebration's logos while the countdown runs, so the
        // burst isn't blank tiles on a phone that hasn't shown those logos yet.
        void queryClient.prefetchQuery(catalogueQuery);
        const catalogue = queryClient.getQueryData(catalogueQuery.queryKey);
        const top = catalogue ? topLabs(buildPool(catalogue.models, Date.now()), 12) : [];
        const labs = top.length >= 6 ? top : FALLBACK_LABS;
        const uris = labs.map((lab) => logoUri(lab.id, resolved)).filter((uri): uri is string => Boolean(uri));
        burstLabs.current = { labs, logos: Image.prefetch(uris, "disk").catch(() => false) };
      }
      const message = tapMessage(tap.count, unlocked);
      if (message) toast(message, { durationMs: 2500, key: "version" });
      return;
    }
    taps.current = null;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    if (unlocked) {
      toast("Higher or lower is under About and legal.", { title: "Again!", tone: "success", key: "version" });
    } else {
      unlockHigherOrLower();
      toast("It's under About and legal now.", { title: "You found Higher or lower", tone: "success", key: "version" });
    }
    const { labs, logos } = burstLabs.current ?? { labs: FALLBACK_LABS, logos: Promise.resolve() };
    burstLabs.current = null;
    // The burst starts once the logos are in, or after 0.8 s at the most.
    void Promise.race([logos, new Promise((resolve) => setTimeout(resolve, 800))]).then(() => setBurst((previous) => ({ labs, run: (previous?.run ?? 0) + 1 })));
  };

  const item = (key: keyof typeof ITEMS, extra: { subtitle?: string | null; value?: string | null; trailing?: ReactNode; last?: boolean } = {}) => {
    const entry = ITEMS[key];
    return <Row key={key} icon={entry.icon} title={entry.title} subtitle={extra.subtitle} value={extra.value} trailing={extra.trailing} selected={pathname === entry.href} onPress={() => openDetail(entry.href)} last={extra.last} />;
  };
  const name = session ? String(session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? session.user.user_metadata?.user_name ?? "").trim() || null : null;
  const email = session?.user.email ?? null;

  return (
    <Screen>
      <Header large title="Account" />
      <ScrollView contentContainerClassName="pb-16">
        {session ? (
          <>
            <View className="px-4 pb-1">
              <Text variant="heading" numberOfLines={1}>{name ?? email ?? "Signed in"}</Text>
              {name && email ? <Text variant="muted" numberOfLines={1}>{email}</Text> : null}
              {twoFactor.data === true ? (
                <View className="mt-1.5 flex-row items-center gap-1.5">
                  <Icon icon={ShieldCheck} tone="success" size={15} />
                  <Text variant="small" className="text-success">Two-factor on</Text>
                </View>
              ) : twoFactor.data === false ? (
                <Pressable accessibilityRole="link" onPress={() => void openWeb("/settings/account/mfa")} className="mt-1.5 flex-row items-center gap-1.5 self-start rounded-md py-0.5 active:opacity-70">
                  <Icon icon={ShieldAlert} tone="warning" size={15} />
                  <Text variant="small" className="text-link">Turn on two-factor</Text>
                </Pressable>
              ) : null}
            </View>
            <Section className="mt-3">
              <Row
                leading={team.data?.logoUrl ? <Image source={{ uri: team.data.logoUrl }} style={{ width: 28, height: 28, borderRadius: 6 }} contentFit="cover" /> : <Logo label={workspace?.name ?? "W"} size={28} />}
                title={workspace?.name ?? "Loading workspace…"}
                subtitle={workspace ? `Workspace · ${roleLabel(workspace.role)}` : null}
                chevron={false}
                trailing={workspaces.length > 1 ? <Button label="Switch" variant="outline" size="sm" onPress={() => router.push("/sheets/workspace")} /> : null}
              />
              <Row
                icon={Wallet}
                title={balance.isLoading ? "…" : formatUsd(balance.data)}
                subtitle="Credit balance"
                chevron={false}
                last
                trailing={(
                  // Adding credit happens on phaseo.app's credits page, in the in-app browser.
                  // Before a Google Play release: linking to a web checkout from the app may conflict with Play's
                  // payments policy for digital goods, so this button needs revisiting (hide it in Play builds, or
                  // use the policy's external-offer programme).
                  <Button label="Add credits" icon={Plus} variant="outline" size="sm" onPress={() => void openWeb("/settings/credits")} />
                )}
              />
            </Section>
          </>
        ) : (
          <View className="px-4 pb-2">
            <Text variant="muted">Sign in once to chat, follow your usage and get notified about new models.</Text>
            <Button label="Sign in" className="mt-3" onPress={() => router.push("/sign-in")} />
          </View>
        )}
        {session ? (
          <Section title="Workspace">
            {item("usage", { subtitle: week.nanos != null ? `${formatUsd(nanosToUsd(week.nanos))} in the last 7 days` : null })}
            {item("credits", { value: balance.data != null ? formatUsd(balance.data) : null })}
            {item("keys", { value: keys.data ? formatNumber(keys.data.length) : null })}
            {item("members", { value: team.data ? formatNumber(team.data.members.length) : null })}
            {item("privacy")}
            <WebRow title="Delete account" subtitle="Opens phaseo.app, where you confirm it" icon={UserX} path="/settings/account/danger" destructive last />
          </Section>
        ) : null}
        <Section title="This device">
          {item("notifications")}
          {item("appearance")}
          {item("chats", { value: storage ? `${formatNumber(storage.chats)} · ${formatBytes(storage.bytes)}` : null, last: true })}
        </Section>
        <Section title="Help">
          {item("status", { trailing: status.data ? <View className="max-w-[55%] flex-row items-center gap-1.5"><StatusDot state={status.data.state} /><Text variant="muted" numberOfLines={1}>{status.data.label}</Text></View> : null })}
          {item("whatsNew")}
          {item("feedback")}
          <WebRow title="Documentation" icon={BookOpen} path="/docs" last />
        </Section>
        <Section title="About and legal">
          <WebRow title="Terms" icon={FileText} path="/terms" />
          <WebRow title="Privacy policy" icon={Shield} path="/privacy" />
          {item("licences")}
          {item("diagnostics")}
          <Row
            icon={Info}
            title="Version and build"
            value={VERSION_LABEL}
            chevron={false}
            last={!unlocked}
            onPress={tapVersion}
            onLongPress={copyVersion}
            longPressLabel="Copy version"
          />
          {unlocked ? item("higherOrLower", { last: true }) : null}
        </Section>
        {session ? (
          <Section>
            <Row
              icon={LogOut}
              title="Sign out"
              destructive
              chevron={false}
              last
              onPress={() => void confirm({ title: "Sign out?", body: "Chats stay on this phone. You'll need to sign in again to send messages or see usage.", confirmLabel: "Sign out", destructive: true }).then((ok) => { if (ok) void signOut(); })}
            />
          </Section>
        ) : null}
      </ScrollView>
      {burst ? <LogoBurst key={burst.run} labs={burst.labs} onDone={endBurst} /> : null}
    </Screen>
  );
}
