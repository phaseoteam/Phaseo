import type { useRouter } from "expo-router";
import { showActions, toast, type Anchor } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { DesktopRequestError, type DesktopClient } from "./client";
import type { PhoneChat } from "./protocol";
import { doneMessage, reverseOf, snoozeChoices, type ChatChange } from "./threadActions";

/** Undo stays offered a little longer than a plain notice. */
const UNDO_MS = 6000;

type Organised = Pick<PhoneChat, "id" | "title" | "snoozedUntil" | "pinned" | "settled">;

/**
 * Changes a thread on its computer, as the window's sidebar would, then says so with Undo where the change has a
 * reverse. The list follows from the computer's own update; a refusal (a running thread can't settle) is shown as is.
 */
export async function changeChat(client: DesktopClient, chat: Organised, change: ChatChange) {
  haptic("press");
  try {
    const { chat: after } = await client.request("update_chat", { chatId: chat.id, ...change });
    const reverse = reverseOf(change, chat);
    toast(doneMessage(change, after), { key: `organise:${chat.id}`, durationMs: reverse ? UNDO_MS : undefined, ...(reverse ? { action: { label: "Undo", onPress: () => void undoChange(client, chat.id, reverse) } } : {}) });
  } catch (problem) {
    haptic("error");
    if (problem instanceof DesktopRequestError && problem.code === "held") toast(problem.message, { title: "Waiting for the computer" });
    else toast(problem instanceof Error ? problem.message : "That didn't work.", { title: "Couldn't change the thread", tone: "error" });
  }
}

/** Puts a thread back as it was, one step at a time, since each step can change what the next one finds. */
export async function undoChange(client: Pick<DesktopClient, "request">, chatId: string, steps: ChatChange[]) {
  haptic("selection");
  try {
    let title = "";
    for (const step of steps) title = (await client.request("update_chat", { chatId, ...step })).chat.title;
    toast(doneMessage(steps[0]!, { title }), { key: `organise:${chatId}` });
  } catch (problem) {
    haptic("error");
    if (problem instanceof DesktopRequestError && problem.code === "held") toast(problem.message, { title: "Waiting for the computer" });
    else toast(problem instanceof Error ? problem.message : "That didn't work.", { title: "Couldn't undo it", tone: "error" });
  }
}

/** The snooze times as a menu; picking one snoozes the thread. */
export function chooseSnooze(client: DesktopClient, chat: Organised, anchor?: Anchor | null) {
  showActions({
    title: `Snooze "${chat.title}"`,
    anchor,
    actions: snoozeChoices().map((choice) => ({ key: choice.label, label: choice.label, description: choice.detail, onPress: () => void changeChat(client, chat, { action: "snooze", until: choice.until }) })),
  });
}

/** The rename sheet for a computer's thread. */
export function renameChat(router: ReturnType<typeof useRouter>, desktopId: string, chat: Organised) {
  router.push({ pathname: "/sheets/[kind]", params: { kind: "rename-desktop-chat", id: chat.id, desktopId, title: chat.title } });
}
