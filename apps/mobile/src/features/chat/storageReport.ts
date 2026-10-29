import type { ChatCounts } from "./db";

export type StorageReport = ChatCounts & {
  /** The SQLite file. */
  databaseBytes: number;
  /** Its write-ahead log and shared-memory index, which hold recent writes until a checkpoint. */
  journalBytes: number;
  attachmentBytes: number;
  attachmentFiles: number;
  totalBytes: number;
};

const bytes = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

/** What chats take up on the device: the database, its journal and the attachment files (missing sizes count as 0). */
export function buildStorageReport(counts: ChatCounts, sizes: { database?: number | null; wal?: number | null; shm?: number | null; attachments: (number | null | undefined)[] }): StorageReport {
  const databaseBytes = bytes(sizes.database);
  const journalBytes = bytes(sizes.wal) + bytes(sizes.shm);
  const attachmentBytes = sizes.attachments.reduce<number>((sum, size) => sum + bytes(size), 0);
  return { ...counts, databaseBytes, journalBytes, attachmentBytes, attachmentFiles: sizes.attachments.length, totalBytes: databaseBytes + journalBytes + attachmentBytes };
}
