import { chatQueues, settleQueue, takeNext } from "./chatQueue";
import { onChatSettled, sendMessage } from "./runner";
import { isChatRunning } from "./state";

/** Sends the chat's next queued message when nothing is answering and the queue isn't held or being edited. */
export function sendNextQueued(chatId: string) {
  if (isChatRunning(chatId)) return;
  const { next, queue } = takeNext(chatQueues.get(chatId));
  if (!next) return;
  chatQueues.update(chatId, () => queue);
  sendMessage({ chatId, text: next.text, attachments: next.attachments, workspaceId: next.workspaceId });
}

// Registered once, for every chat, so a queue keeps going after its screen closes.
onChatSettled((chatId, outcome) => {
  chatQueues.update(chatId, (queue) => settleQueue(queue, outcome));
  sendNextQueued(chatId);
});
