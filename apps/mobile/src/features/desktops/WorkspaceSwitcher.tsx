import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Check, ChevronsUpDown, GitPullRequest, Monitor, Plus, Settings2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import type { ConnectionState } from "./client";
import { clientFor, connectionLabel, useConnection } from "./connections";
import { useNeedsYouCount } from "./needsYou";
import { choosePhaseo, chooseDesktop, workspaceDesktop, workspaceStore } from "./picked";
import { readsGit } from "./git/gitState";
import type { SavedDesktop } from "./reach";
import { desktopPullRequestsHref } from "./routes";
import { useDesktops } from "./store";

const phaseoIcon = require("../../../assets/phaseo-icon.png") as number;

/** A small square in the connection's colour: on, getting there, or not reachable. */
const DOT: Record<ConnectionState["status"], string> = {
  connected: "bg-success",
  connecting: "bg-warning",
  offline: "bg-muted-foreground",
  refused: "bg-destructive",
  stopped: "bg-muted-foreground",
};

/**
 * The top of the sidebar: what the app works in, Phaseo (the chats on this phone) or a paired computer (its projects
 * and threads). Tapping it lists the choices, each computer with its connection and how many threads need you, then
 * Pair a computer and Manage computers. Closed, it shows how many threads need you on the computers not showing.
 */
export function WorkspaceSwitcher() {
  const router = useRouter();
  const desktops = useDesktops();
  const workspace = workspaceStore.use();
  const current = workspaceDesktop(desktops, workspace);
  const [open, setOpen] = useState(false);
  const total = useNeedsYouCount();
  const here = useNeedsYouCount(current?.desktopId ?? "");
  const elsewhere = total - (current ? here : 0);
  const pick = (choose: () => void) => { choose(); setOpen(false); };
  return (
    <View className="pb-1 pt-2">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={[current ? current.desktopName : "Phaseo", elsewhere ? `${elsewhere} need you on other computers` : null, "Switch workspace"].filter(Boolean).join(", ")}
        onPress={() => setOpen((value) => !value)}
        className="mx-2 h-12 flex-row items-center gap-3 rounded-md px-3 active:bg-accent"
      >
        {current ? <DesktopIcon desktop={current} /> : <PhaseoIcon />}
        <View className="flex-1">
          <Text variant="body" numberOfLines={1} className="font-semibold">{current ? current.desktopName : "Phaseo"}</Text>
          {current ? <DesktopCaption desktop={current} /> : <PhaseoCaption />}
        </View>
        {elsewhere && !open ? <Text variant="caption" className="font-semibold text-warning">{elsewhere}</Text> : null}
        <Icon icon={ChevronsUpDown} tone="muted" size={16} />
      </Pressable>
      {open ? (
        <View className="mt-1 gap-0.5 border-b border-border pb-2">
          <Option selected={!current} label="Phaseo" onPress={() => pick(choosePhaseo)} icon={<PhaseoIcon />} caption={<PhaseoCaption />} />
          {(desktops ?? []).map((desktop) => <DesktopOption key={desktop.desktopId} desktop={desktop} selected={current?.desktopId === desktop.desktopId} onPick={() => pick(() => chooseDesktop(desktop.desktopId))} />)}
          {current ? <PullRequestsAction desktop={current} onPress={() => { setOpen(false); router.push(desktopPullRequestsHref(current.desktopId)); }} /> : null}
          <Action icon={Plus} label="Pair a computer…" onPress={() => { setOpen(false); router.push("/pair"); }} />
          {desktops?.length ? <Action icon={Settings2} label="Manage computers…" onPress={() => { setOpen(false); router.push("/desktops"); }} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function PhaseoIcon() {
  return <Image source={phaseoIcon} style={{ width: 28, height: 28, borderRadius: 6 }} accessibilityElementsHidden importantForAccessibility="no" />;
}

function PhaseoCaption() {
  const { workspace } = useWorkspace();
  return <Text variant="caption" numberOfLines={1}>{workspace?.name ? `Chats on this phone · ${workspace.name}` : "Chats on this phone"}</Text>;
}

function DesktopIcon({ desktop }: { desktop: SavedDesktop }) {
  const state = useConnection(clientFor(desktop));
  return (
    <View className="h-7 w-7 items-center justify-center rounded-md bg-muted">
      <Icon icon={Monitor} tone="muted" size={16} />
      <View className={cn("absolute bottom-0.5 right-0.5 h-2 w-2 rounded-[2px] border border-background", DOT[state.status])} />
    </View>
  );
}

function DesktopCaption({ desktop }: { desktop: SavedDesktop }) {
  const state = useConnection(clientFor(desktop));
  return <Text variant="caption" numberOfLines={1} className={cn(state.status === "refused" && "text-destructive")}>{connectionLabel(state)}</Text>;
}

function DesktopOption({ desktop, selected, onPick }: { desktop: SavedDesktop; selected: boolean; onPick(): void }) {
  const count = useNeedsYouCount(desktop.desktopId);
  return (
    <Option
      selected={selected}
      label={desktop.desktopName}
      onPress={onPick}
      icon={<DesktopIcon desktop={desktop} />}
      caption={<DesktopCaption desktop={desktop} />}
      count={count}
    />
  );
}

function Option({ selected, label, icon, caption, count, onPress }: { selected: boolean; label: string; icon: React.ReactNode; caption: React.ReactNode; count?: number; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={[label, count ? `${count} need you` : null].filter(Boolean).join(", ")}
      onPress={onPress}
      className={cn("mx-2 flex-row items-center gap-3 rounded-md px-3 py-2 active:bg-accent", selected && "bg-accent")}
    >
      {icon}
      <View className="flex-1">
        <Text variant="body" numberOfLines={1} className={cn(selected && "font-semibold")}>{label}</Text>
        {caption}
      </View>
      {count ? <Text variant="caption" className="font-semibold text-warning">{`${count} need you`}</Text> : null}
      {selected ? <Icon icon={Check} size={16} /> : null}
    </Pressable>
  );
}

/** The chosen computer's pull requests, while it lets this phone read code (protocol 6). */
function PullRequestsAction({ desktop, onPress }: { desktop: SavedDesktop; onPress(): void }) {
  return readsGit(useConnection(clientFor(desktop))) ? <Action icon={GitPullRequest} label={`Pull requests on ${desktop.desktopName}`} onPress={onPress} /> : null;
}

function Action({ icon, label, onPress }: { icon: typeof Plus; label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="mx-2 h-10 flex-row items-center gap-3 rounded-md px-3 active:bg-accent">
      <View className="w-7 items-center"><Icon icon={icon} tone="muted" size={18} /></View>
      <Text variant="body" className="text-muted-foreground">{label}</Text>
    </Pressable>
  );
}
