import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useFocusEffect, usePathname, useRouter, type Href } from "expo-router";
import {
  Activity, Bell, BookOpen, ChartNoAxesColumn, ExternalLink, FileText, Gauge, HardDrive, Info, KeyRound, LogOut, MessageSquareText, Monitor, Palette, Plus, Scale,
  Shield, ShieldAlert, ShieldCheck, Sparkles, UserX, Users, Wallet, type LucideIcon,
} from "lucide-react-native";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Logo } from "@/components/Logo";
import { useOpenDetail } from "@/components/shell/SplitStack";
import { Button, confirm, Header, Icon, Row, Screen, Section, Text, toast } from "@/components/ui";
import { readStorageReport } from "@/features/chat/deviceStorage";
import { FULL_VERSION_LABEL, VERSION_LABEL } from "@/lib/appInfo";
import { formatBytes, formatNumber, formatUsd, nanosToUsd } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { openWeb } from "@/lib/web";
import { useAppearance } from "@/providers/AppearanceProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { useBalance, useKeys, useStatus, useTeam, useTwoFactor, useWeekSpend } from "./queries";
import { StatusDot } from "./StatusScreen";
import { nextTap, TAPS_TO_OPEN, type TapRun } from "./versionArt";
import { prefetchVersionArt } from "./VersionArtScreen";

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

  // Five quick taps on Version and build open the version art, as on Android. Nothing shows while tapping (no
  // countdown), and it opens every time.
  const queryClient = useQueryClient();
  const { resolved } = useAppearance();
  const taps = useRef<TapRun | null>(null);
  const openVersionArt = () => {
    haptic("success");
    router.push("/version");
  };
  const tapVersion = () => {
    const { run, open } = nextTap(taps.current, Date.now());
    taps.current = run;
    // Halfway there, start loading the catalogue and the labs' logos, so the art opens with them.
    if (run?.count === Math.ceil(TAPS_TO_OPEN / 2)) prefetchVersionArt(queryClient, resolved);
    if (open) openVersionArt();
  };
  const copyVersion = () => void Clipboard.setStringAsync(FULL_VERSION_LABEL).then(() => toast("Version copied.", { key: "version" }));

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
          {item("chats", { value: storage ? `${formatNumber(storage.chats)} · ${formatBytes(storage.bytes)}` : null })}
          {/* A full-screen flow of its own (pairing), so it opens above the tabs on tablets too. */}
          <Row icon={Monitor} title="Desktops" subtitle="Pair, rename and remove your computers" onPress={() => router.push("/desktops")} last />
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
            last
            onPress={tapVersion}
            onLongPress={copyVersion}
            longPressLabel="Copy version"
            actions={[{ label: "Show version art", run: openVersionArt }]}
          />
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
    </Screen>
  );
}
