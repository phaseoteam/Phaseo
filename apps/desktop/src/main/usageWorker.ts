import { parentPort, workerData } from "node:worker_threads";
import { serveTranscriptReads } from "./usageTranscripts";
import { serveTranscriptWrites } from "./usageLedgerWrites";

// A transcript reader for the Usage page's scanner (see TranscriptReaders), or with a database its writer (see TranscriptWriter).
const writer = (workerData as { writer?: unknown } | null)?.writer;
if (parentPort) { if (typeof writer === "string") serveTranscriptWrites(parentPort, writer); else serveTranscriptReads(parentPort); }
