import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { createStore } from "@/lib/store";
import { BRAND_COLOR } from "@/features/notifications/channels";
import { allClients, clientFor, keepClients } from "./connections";
import type { AttentionKind } from "./protocol";
import type { SavedDesktop } from "./reach";
import { loadDesktops, useDesktops } from "./store";

/** The desktop chat on screen, whose attention needs no notification. */
export const openDesktopChat = createStore<{ desktopId: string; chatId: string } | null>(null);

const CHANNEL_ID = "desktops";
let channelReady: Promise<unknown> | null = null;
const ensureChannel = () => {
  if (Platform.OS !== "android") return Promise.resolve();
  channelReady ??= Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Your computers",
    description: "Approvals, questions and finished chats from Phaseo on your computer, while this app is open",
    importance: AndroidImportance.HIGH,
    lightColor: BRAND_COLOR,
  });
  return channelReady;
};

const titles: Record<AttentionKind, string> = {
  approval: "A chat needs your approval",
  question: "A chat has a question",
  done: "A chat finished",
  failed: "A chat failed",
};

async function notify(desktop: SavedDesktop, attention: { chatId: string; kind: AttentionKind; summary: string }) {
  const open = openDesktopChat.get();
  if (open?.desktopId === desktop.desktopId && open.chatId === attention.chatId && AppState.currentState === "active") return;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${titles[attention.kind]} on ${desktop.desktopName}`,
      body: attention.summary,
      data: { desktopId: desktop.desktopId, chatId: attention.chatId },
    },
    trigger: Platform.OS === "android" ? { channelId: CHANNEL_ID } : null,
  });
}

/**
 * Keeps every paired desktop connected while the app runs, tries again at once when the app comes back to the
 * foreground, and turns attention frames into local notifications. Push while the app is closed isn't in v1.
 */
export function DesktopConnections() {
  const desktops = useDesktops();

  useEffect(() => { void loadDesktops(); }, []);

  useEffect(() => {
    if (!desktops) return;
    keepClients(desktops.map((desktop) => desktop.desktopId));
    const stops = desktops.map((desktop) => {
      const client = clientFor(desktop);
      client.start();
      return client.on((event) => { if (event.type === "attention") void notify(desktop, event).catch(() => undefined); });
    });
    return () => { for (const stop of stops) stop(); };
  }, [desktops]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") for (const [, client] of allClients()) client.retryNow();
    });
    return () => subscription.remove();
  }, []);

  return null;
}
