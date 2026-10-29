import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { APP_VERSION } from "@/lib/config";
import { measureAsync } from "@/lib/diagnostics";
import { getChat, listChatsAsync, messagesAfter } from "./db";
import { bufferedSink, EXPORT_MIME, exportFileName, writeExport, type ExportFormat } from "./export";
import { modelLabelFor } from "./models";
import type { Chat } from "./types";

const exportTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export type ExportResult = { uri: string; name: string; mimeType: string; bytes: number; chats: number; messages: number };

/**
 * Writes chats to a file in the app's cache (the previous export is removed first), in 64 KB appends while the
 * messages are read a page at a time.
 */
export async function exportChats(chatIds: string[] | "all", format: ExportFormat): Promise<ExportResult> {
  const chats = chatIds === "all" ? await listChatsAsync() : chatIds.map((id) => getChat(id)).filter((chat): chat is Chat => Boolean(chat));
  if (!chats.length) throw new Error("There are no chats on this device to export.");
  const exportedAt = Date.now();
  const folder = new Directory(Paths.cache, "exports");
  if (folder.exists) folder.delete();
  folder.create({ intermediates: true });
  const file = new File(folder, exportFileName(chats, format, exportedAt));
  file.create();
  const sink = bufferedSink((text) => file.write(text, { append: true }));
  const result = await measureAsync("Chat export", async () => {
    const written = await writeExport(chats, format, sink, messagesAfter, { appVersion: APP_VERSION, exportedAt, modelName: (id) => modelLabelFor(id), formatTime: (ms) => exportTime.format(ms) });
    await sink.flush();
    return written;
  }, (written) => `${format === "json" ? "JSON" : "Markdown"}, ${written.chats} chats, ${written.messages} messages`);
  return { ...result, uri: file.uri, name: file.name, mimeType: EXPORT_MIME[format], bytes: file.size ?? 0 };
}

/** Opens the system share sheet for an export (save to Files or Drive, send by email, …). */
export async function shareExport(result: ExportResult) {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
  await Sharing.shareAsync(result.uri, { mimeType: result.mimeType, dialogTitle: `Share ${result.name}` });
}
