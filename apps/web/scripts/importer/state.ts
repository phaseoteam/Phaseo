import { promises as fs } from "fs";
import { dirname, relative, resolve, sep } from "path";
import { DATA_ROOT } from "./paths";

type PersistedState = {
    version: number;
    files: Record<string, FileRecord>;
};

export type FileRecord = {
    hash: string;
    meta?: Record<string, any>;
};

export type ChangeResult = {
    path: string;
    status: "added" | "changed" | "unchanged";
    previous?: FileRecord;
    current: FileRecord;
};

export const DEFAULT_STATE_PATH = process.env.IMPORT_STATE_PATH
    ? resolve(process.cwd(), process.env.IMPORT_STATE_PATH)
    // Keep importer state alongside the data itself so different DATA_ROOTs don't collide.
    : resolve(DATA_ROOT, ".import-state.json");

function normalizePath(p: string) {
    const rel = relative(process.cwd(), p);
    return rel.split(sep).join("/");
}

export async function loadPersistedState(statePath: string): Promise<PersistedState> {
    try {
        const raw = await fs.readFile(statePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.files) {
            return { version: 1, ...parsed };
        }
    } catch {
        // Treat missing/invalid files as empty state.
    }
    return { version: 1, files: {} };
}

export class ChangeTracker {
    private prev: PersistedState;
    private next: PersistedState;
    private touchedPrefixes = new Set<string>();

    private constructor(
        prev: PersistedState,
        private statePath: string,
        private forceFull: boolean
    ) {
        this.prev = prev;
        this.next = { version: prev.version, files: {} };
    }

    static async init(
        statePath: string = DEFAULT_STATE_PATH,
        { forceFull = false }: { forceFull?: boolean } = {}
    ) {
        const prev = await loadPersistedState(statePath);
        return new ChangeTracker(prev, statePath, forceFull);
    }

    isFullImport() {
        return this.forceFull;
    }

    touchPrefix(prefix: string) {
        const norm = normalizePath(prefix);
        this.touchedPrefixes.add(norm.endsWith("/") ? norm : `${norm}/`);
    }

    track(path: string, hash: string, meta?: Record<string, any>): ChangeResult {
        const norm = normalizePath(path);
        const current: FileRecord = { hash, meta };
        this.next.files[norm] = current;

        const previous = this.prev.files[norm];
        if (!previous) {
            return { path: norm, status: "added", current };
        }
        if (this.forceFull) {
            return { path: norm, status: "changed", previous, current };
        }
        if (previous.hash !== hash) {
            return { path: norm, status: "changed", previous, current };
        }
        // Keep the previous record so we don't churn metadata on no-op runs.
        this.next.files[norm] = previous;
        return { path: norm, status: "unchanged", previous, current: previous };
    }

    getDeleted(prefix?: string) {
        const normPrefix = prefix ? `${normalizePath(prefix).replace(/\/?$/, "/")}` : "";
        return Object.entries(this.prev.files)
            .filter(([p]) => {
                if (normPrefix && !p.startsWith(normPrefix)) return false;
                return !(p in this.next.files);
            })
            .map(([path, info]) => ({ path, info }));
    }

    async persist({ dryRun = false }: { dryRun?: boolean } = {}) {
        if (dryRun) return;

        const merged: Record<string, FileRecord> = { ...this.prev.files };
        for (const path of Object.keys(this.prev.files)) {
            const touched = Array.from(this.touchedPrefixes).some(pref => path.startsWith(pref));
            if (touched && !(path in this.next.files)) {
                delete merged[path];
            } else if (path in this.next.files) {
                merged[path] = this.next.files[path];
            }
        }

        for (const path of Object.keys(this.next.files)) {
            merged[path] = this.next.files[path];
        }

        await fs.mkdir(dirname(this.statePath), { recursive: true });
        await fs.writeFile(this.statePath, JSON.stringify({ version: this.prev.version, files: merged }, null, 2));
    }
}
