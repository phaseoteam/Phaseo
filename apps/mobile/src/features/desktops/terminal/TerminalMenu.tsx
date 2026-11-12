import { useRouter } from "expo-router";
import { Play, Plus, Server, SquareTerminal } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, confirm, Row, Sheet, showActions, SkeletonRows, Text, toastError, type MenuAction } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import type { DesktopClient } from "../client";
import { desktopTerminalHref } from "../routes";
import { useServers } from "./hooks";
import { terminalStatus } from "./terminalState";

/**
 * The thread header's Terminal menu, as the window's terminal drawer offers it: the thread's terminals, the project's
 * scripts and New terminal, read when it opens; then Running servers. Each opens in the thread's own folder.
 */
export function useTerminalMenu(client: DesktopClient, desktopId: string, chatId: string) {
  const router = useRouter();
  const [serversOpen, setServersOpen] = useState(false);
  const busy = useRef(false);
  const openTerminal = useCallback(async (scriptId?: string) => {
    try {
      const { terminal } = await client.request("open_terminal", { chatId, ...(scriptId ? { scriptId } : {}) });
      haptic("success");
      router.push(desktopTerminalHref(desktopId, chatId, terminal.id, terminal.title));
    } catch (problem) { toastError("Couldn't open a terminal", problem); }
  }, [client, chatId, desktopId, router]);
  const open = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const { terminals, scripts } = await client.request("list_terminals", { chatId });
      const actions: MenuAction[] = [
        ...terminals.map((terminal) => ({ key: terminal.id, label: terminal.title, description: terminalStatus(terminal), icon: SquareTerminal, onPress: () => router.push(desktopTerminalHref(desktopId, chatId, terminal.id, terminal.title)) })),
        ...scripts.map((script) => ({ key: `script:${script.id}`, label: `Run ${script.name}`, description: script.command, icon: Play, onPress: () => void openTerminal(script.id) })),
        { key: "new", label: "New terminal", icon: Plus, onPress: () => void openTerminal() },
        { key: "servers", label: "Running servers", icon: Server, onPress: () => setServersOpen(true) },
      ];
      showActions({ title: "Terminal", actions });
    } catch (problem) { toastError("Couldn't read the terminals", problem); }
    finally { busy.current = false; }
  }, [client, chatId, desktopId, router, openTerminal]);
  return { open, serversSheet: <ServersSheet client={client} chatId={chatId} open={serversOpen} onClose={() => setServersOpen(false)} /> };
}

/** The local servers the thread started on the computer, with Stop, as the window's thread details list them. */
function ServersSheet({ client, chatId, open, onClose }: { client: DesktopClient; chatId: string; open: boolean; onClose(): void }) {
  const { servers, error, stopping, load, stop } = useServers(client, chatId);
  // Read each time it opens, never on a timer.
  useEffect(() => { if (open) load(); }, [open, load]);
  const ask = async (port: number, name: string) => {
    if (!(await confirm({ title: `Stop ${name}?`, body: "Stops the server and everything it started on the computer. The terminal that ran it stays open.", confirmLabel: "Stop server", destructive: true }))) return;
    if (await stop(port)) haptic("success");
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <ScrollView className="max-h-[480px]">
        <View className="gap-1 px-4 pb-2 pt-4">
          <Text variant="heading">Running servers</Text>
          <Text variant="caption">{"Servers this thread's terminals and commands started on the computer. Their localhost addresses are the computer's, not this phone's."}</Text>
        </View>
        {error ? <Text variant="caption" className="px-4 py-2 text-destructive">{error}</Text> : !servers ? <SkeletonRows count={2} /> : !servers.length ? (
          <Text variant="caption" className="px-4 py-3">No servers running from this thread.</Text>
        ) : servers.map((server, index) => {
          const name = `localhost:${server.port}`;
          return (
            <Row key={server.port} icon={Server} title={name} subtitle={[server.process, `from ${server.startedBy}`].filter(Boolean).join(" · ")} last={index === servers.length - 1}
              trailing={<Button label={stopping === server.port ? "Stopping…" : "Stop"} variant="destructive" size="sm" disabled={stopping !== null} onPress={() => void ask(server.port, name)} />} />
          );
        })}
        <View className="px-4 pb-4 pt-2"><Button label="Done" variant="secondary" onPress={onClose} /></View>
      </ScrollView>
    </Sheet>
  );
}
