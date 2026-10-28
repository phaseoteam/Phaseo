import { File } from "expo-file-system";
import { attachmentFileSizes } from "./attachments";
import { chatCounts, db } from "./db";
import { buildStorageReport, type StorageReport } from "./storageReport";

export type { StorageReport } from "./storageReport";

function fileSize(path: string) {
  try {
    const file = new File(path.startsWith("file:") ? path : `file://${path}`);
    return file.exists ? file.size ?? 0 : 0;
  } catch {
    return 0;
  }
}

/** Reads the counts from SQLite and the sizes from the file system (a few small calls). */
export function readStorageReport(): StorageReport {
  const database = db();
  const path = database.databasePath;
  return buildStorageReport(chatCounts(database), { database: fileSize(path), wal: fileSize(`${path}-wal`), shm: fileSize(`${path}-shm`), attachments: attachmentFileSizes() });
}
