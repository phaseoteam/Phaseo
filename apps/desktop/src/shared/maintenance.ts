/** Files Settings → Maintenance can remove after the days set in Storage: browser recordings, and log files the trace log rotated out. */
export type RetentionKind = "recordings" | "logs";
export const retentionKinds: RetentionKind[] = ["recordings", "logs"];
export type RetentionCount = { files: number; bytes: number };
/** What Clean up now would remove, kept by the main process under `id` until it is confirmed. */
export type RetentionPreview = { id: string; kinds: Record<RetentionKind, RetentionCount & { afterDays: number | null }> };
/** What a cleanup removed, and how many files it could not remove. */
export type RetentionReport = { removed: Record<RetentionKind, RetentionCount>; failed: number; finishedAt: string };

export type MaintenanceApi = {
	retentionPreview: () => Promise<RetentionPreview>;
	/** Removes the files of that preview that are still past their days; nothing else. */
	retentionClean: (id: string) => Promise<RetentionReport>;
	/** The last cleanup, automatic or not, since Phaseo started. */
	retentionLast: () => Promise<RetentionReport | undefined>;
	/** Opens the third-party licence notices the build writes, in the system's text viewer. */
	openNotices: () => Promise<void>;
};
