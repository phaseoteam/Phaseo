import { useCallback, useEffect, useRef, useState } from "react";
import { applyEntries, firstMessageId, mergeChat, mergeDetail, prependEntries, sortChats } from "./chatState";
import type { ClientEvent, DesktopClient } from "./client";
import { useClientEvents } from "./connections";
import type { PhoneChat, PhoneChatDetail, PhoneEntry } from "./protocol";

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

/** A desktop's chats, "needs you" first, kept current by chat_updated and read again after each reconnect. */
export function useDesktopChats(client: DesktopClient | null) {
  const [chats, setChats] = useState<PhoneChat[] | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const failed = useRef(false);

  // State is set only when the answer arrives, never while the effect that asked runs.
  const load = useCallback(() => {
    if (!client) return;
    client.request("list_chats", {}).then((page) => {
      setChats(sortChats(page.chats));
      setCursor(page.cursor);
      setError(null);
      failed.current = false;
    }, (problem: unknown) => {
      setError(messageOf(problem));
      failed.current = true;
    });
  }, [client]);

  useEffect(load, [load]);

  useClientEvents(client, useCallback((event: ClientEvent) => {
    if (event.type === "connected" && (event.reconnect || failed.current)) load();
    if (event.type === "chat_updated") setChats((current) => (current ? mergeChat(current, event.chat) : current));
  }, [load]));

  const loadMore = useCallback(async () => {
    if (!client || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await client.request("list_chats", { cursor });
      setChats((current) => sortChats([...(current ?? []).filter((chat) => !page.chats.some((entry) => entry.id === chat.id)), ...page.chats]));
      setCursor(page.cursor);
    } catch (problem) {
      setError(messageOf(problem));
    } finally {
      setLoadingMore(false);
    }
  }, [client, cursor, loadingMore]);

  return { chats, error, reload: load, loadMore: cursor ? loadMore : null, loadingMore };
}

type ChatView = { chat: PhoneChatDetail; entries: PhoneEntry[]; earlier: number };

/**
 * One chat: its latest page, streamed entries applied as they come, earlier pages on request. It's watched while the
 * screen is mounted and read again after a reconnect, since entries sent while offline are gone.
 */
export function useDesktopChat(client: DesktopClient | null, chatId: string) {
  const [view, setView] = useState<ChatView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const failed = useRef(false);

  const read = useCallback(() => {
    if (!client) return;
    client.request("read_chat", { chatId }).then((result) => {
      setView({ chat: result.chat, entries: result.entries, earlier: result.earlier });
      setError(null);
      failed.current = false;
    }, (problem: unknown) => {
      setError(messageOf(problem));
      failed.current = true;
    });
  }, [client, chatId]);

  useEffect(() => {
    if (!client) return;
    const release = client.watch(chatId);
    read();
    return release;
  }, [client, chatId, read]);

  useClientEvents(client, useCallback((event: ClientEvent) => {
    if (event.type === "connected") { if (event.reconnect || failed.current) read(); }
    else if (event.type === "entries" && event.chatId === chatId) setView((current) => (current ? { ...current, entries: applyEntries(current.entries, event.entries) } : current));
    else if (event.type === "chat_updated" && event.chat.id === chatId) setView((current) => (current ? { ...current, chat: mergeDetail(current.chat, event.chat) } : current));
  }, [read, chatId]));

  const loadEarlier = useCallback(async () => {
    const before = view ? firstMessageId(view.entries) : undefined;
    if (!client || !before || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const result = await client.request("read_chat", { chatId, before });
      setView((current) => (current ? { ...current, entries: prependEntries(current.entries, result.entries), earlier: result.earlier } : current));
    } catch (problem) {
      setError(messageOf(problem));
    } finally {
      setLoadingEarlier(false);
    }
  }, [client, chatId, view, loadingEarlier]);

  /** Drops an answered approval or question at once; the desktop's next update confirms it. */
  const settle = useCallback((kind: "approval" | "question", id: string) => {
    setView((current) => (current ? { ...current, chat: { ...current.chat, ...(kind === "approval" ? { approvals: current.chat.approvals.filter((entry) => entry.id !== id) } : { questions: current.chat.questions.filter((entry) => entry.id !== id) }) } } : current));
  }, []);

  return { view, error, reload: read, loadEarlier: view && view.earlier > 0 ? loadEarlier : null, loadingEarlier, settle };
}
