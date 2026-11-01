import { useEffect, useSyncExternalStore } from "react";
import { APP_VERSION } from "@/lib/config";
import { DesktopClient, type ClientEvent, type ConnectionState } from "./client";
import { chooseTransport, type FetchLike, type SavedDesktop } from "./reach";
import { openNativeSocket } from "./transport";

const clients = new Map<string, DesktopClient>();
const nativeFetch = fetch as unknown as FetchLike;

/** The one client for a paired desktop, shared by its screens and the attention notifications. */
export function clientFor(desktop: SavedDesktop): DesktopClient {
  let client = clients.get(desktop.desktopId);
  if (!client) {
    client = new DesktopClient({
      deviceId: desktop.deviceId,
      appVersion: APP_VERSION,
      choose: () => chooseTransport(desktop, { fetch: nativeFetch, openSocket: openNativeSocket }),
    });
    clients.set(desktop.desktopId, client);
  }
  return client;
}

/** Disconnects and drops the clients of desktops no longer paired. */
export function keepClients(desktopIds: string[]) {
  for (const [id, client] of clients) {
    if (desktopIds.includes(id)) continue;
    client.stop();
    clients.delete(id);
  }
}

export const allClients = () => [...clients.entries()];

const stopped: ConnectionState = { status: "stopped" };
const noSubscribe = () => () => undefined;

/** A desktop's connection state, for its row and its screens. */
export function useConnection(client: DesktopClient | null) {
  return useSyncExternalStore(client?.state.subscribe ?? noSubscribe, () => client?.state.get() ?? stopped, () => stopped);
}

/** Calls `listener` with the desktop's events while the screen is mounted. */
export function useClientEvents(client: DesktopClient | null, listener: (event: ClientEvent) => void) {
  useEffect(() => (client ? client.on(listener) : undefined), [client, listener]);
}

/** Words for a connection's state: how it's connected, or why not. */
export function connectionLabel(state: ConnectionState) {
  switch (state.status) {
    case "connected": return state.via === "direct" ? "Connected directly" : "Connected through Phaseo Connect";
    case "connecting": return "Connecting…";
    case "offline": return state.message;
    case "refused": return state.message;
    case "stopped": return "Not connected";
  }
}
