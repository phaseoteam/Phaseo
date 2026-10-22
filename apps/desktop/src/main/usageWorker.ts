import { parentPort } from "node:worker_threads";
import { serveTranscriptReads } from "./usageTranscripts";

// A transcript reader for the Usage page's scanner (see TranscriptReaders).
if (parentPort) serveTranscriptReads(parentPort);
