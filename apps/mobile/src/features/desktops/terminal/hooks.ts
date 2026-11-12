import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { toastError } from "@/components/ui";
import type { ClientEvent, DesktopClient } from "../client";
import { useClientEvents, useConnection } from "../connections";
import type { PhoneServer, PhoneTerminal } from "../protocol";
import { inputChunks, usesTerminals } from "./terminalState";

/** What the terminal's page is told: output to write, and a reset before a fresh replay. */
export type TerminalSink = { write(data: string): void; reset(): void };

const SKIPPED = "\r\n\u001b[2m[More output than the phone is sent at once. Earlier lines are on the computer.]\u001b[0m\r\n";
const EARLIER = "\u001b[2m[Earlier output is on the computer.]\u001b[0m\r\n";

/**
 * One terminal on the computer, watched while the screen is in view: its recent output, then what it writes, and the
 * same again after a reconnect. Leaving the screen stops the stream, so nothing is sent for a terminal nobody sees.
 */
export function useTerminal(client: DesktopClient, terminalId: string, sink: TerminalSink) {
  const allowed = usesTerminals(useConnection(client));
  const [terminal, setTerminal] = useState<PhoneTerminal | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  // Output that arrives while an attach is answered waits for the replay, so it's written after it, never before.
  const attaching = useRef(false);
  const held = useRef<string[]>([]);
  const attempt = useRef(0);

  const attach = useCallback(() => {
    if (!allowed) return;
    const asked = ++attempt.current;
    attaching.current = true; held.current = [];
    client.request("attach_terminal", { terminalId }).then((result) => {
      if (asked !== attempt.current) return;
      attaching.current = false;
      sink.reset();
      sink.write((result.truncated ? EARLIER : "") + result.output + held.current.join(""));
      held.current = [];
      setTerminal(result.terminal); setError(null);
    }, (problem: unknown) => {
      if (asked !== attempt.current) return;
      attaching.current = false;
      setError({ message: problem instanceof Error ? problem.message : "Couldn't open this terminal.", ...(problem && typeof problem === "object" && "code" in problem ? { code: String(problem.code) } : {}) });
    });
  }, [client, terminalId, allowed, sink]);

  useFocusEffect(useCallback(() => {
    attach();
    return () => {
      attempt.current++;
      client.request("detach_terminal", { terminalId }, { live: true }).catch(() => undefined);
    };
  }, [attach, client, terminalId]));

  useClientEvents(client, useCallback((event: ClientEvent) => {
    if (event.type === "connected" && event.reconnect) attach();
    if (event.type === "terminal_output" && event.terminalId === terminalId) {
      const data = (event.skipped ? SKIPPED : "") + event.data;
      if (attaching.current) held.current.push(data); else sink.write(data);
    }
    if (event.type === "terminal_updated" && event.terminal.id === terminalId) setTerminal(event.terminal);
  }, [attach, terminalId, sink]));

  // Typing goes now or not at all, in order, and one failure is reported once rather than per key.
  const failing = useRef(false);
  const send = useCallback((data: string) => {
    if (!data || terminal?.status !== "running") return;
    for (const chunk of inputChunks(data)) {
      client.request("terminal_input", { terminalId, data: chunk }, { live: true }).then(() => { failing.current = false; }, (problem: unknown) => {
        if (failing.current) return;
        failing.current = true;
        toastError("Not typed on the computer", problem);
      });
    }
  }, [client, terminalId, terminal?.status]);

  return { allowed, terminal, error, retry: attach, send };
}

/** The local servers a thread started, read when the sheet opens, and Stop for one. */
export function useServers(client: DesktopClient | null, chatId: string) {
  const [state, setState] = useState<{ servers: PhoneServer[] | null; error: string | null; stopping: number | null }>({ servers: null, error: null, stopping: null });
  const load = useCallback(() => {
    if (!client) return;
    setState((current) => ({ ...current, error: null }));
    client.request("list_servers", { chatId }).then(
      ({ servers }) => setState((current) => ({ ...current, servers, error: null })),
      (problem: unknown) => setState((current) => ({ ...current, error: problem instanceof Error ? problem.message : "Couldn't read the servers." })),
    );
  }, [client, chatId]);
  const stop = useCallback(async (port: number) => {
    if (!client) return false;
    setState((current) => ({ ...current, stopping: port }));
    try {
      const { servers } = await client.request("stop_server", { chatId, port });
      setState({ servers, error: null, stopping: null });
      return true;
    } catch (problem) {
      setState((current) => ({ ...current, stopping: null }));
      toastError("Couldn't stop it", problem);
      return false;
    }
  }, [client, chatId]);
  return { ...state, load, stop };
}
