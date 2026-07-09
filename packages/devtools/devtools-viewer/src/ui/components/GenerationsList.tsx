import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  Download,
  Search,
  X
} from "lucide-react";
import type { DevToolsEntry } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  getEntrySearchTerms,
  getGenerationCorrelationMetadata,
  getGenerationLookupId
} from "@/utils/generationMetadata";

interface GenerationsListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function GenerationsList({ selectedId, onSelect }: GenerationsListProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["generations"],
    queryFn: async () => {
      const res = await fetch("/api/generations?limit=200");
      if (!res.ok) throw new Error("Failed to fetch generations");
      return res.json() as Promise<{ generations: DevToolsEntry[]; total: number }>;
    }
  });
  const [query, setQuery] = useState("");
  const [endpoint, setEndpoint] = useState<string>("all");
  const [selectedSdks, setSelectedSdks] = useState<string[] | null>(null);
  const [sdkMenuOpen, setSdkMenuOpen] = useState(false);
  const sdkMenuRef = useRef<HTMLDivElement | null>(null);

  const endpoints = useMemo(() => {
    if (!data?.generations) return [];
    return Array.from(new Set(data.generations.map((entry) => entry.type))).sort();
  }, [data?.generations]);

  const sdkValues = useMemo(() => {
    if (!data?.generations) return [];
    return Array.from(
      new Set(
        data.generations
          .map((entry) => entry.metadata.sdk)
          .filter((value): value is string => Boolean(value))
      )
    ).sort((a, b) => getSdkLabel(a).localeCompare(getSdkLabel(b)));
  }, [data?.generations]);

  useEffect(() => {
    if (endpoint !== "all" && !endpoints.includes(endpoint)) {
      setEndpoint("all");
    }
  }, [endpoint, endpoints]);

  useEffect(() => {
    setSelectedSdks((previous) => {
      if (previous === null) return null;
      const filtered = previous.filter((value) => sdkValues.includes(value));
      return filtered.length === sdkValues.length ? null : filtered;
    });
  }, [sdkValues]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!sdkMenuRef.current) return;
      if (sdkMenuRef.current.contains(event.target as Node)) return;
      setSdkMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSdkMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data?.generations) return [];
    const search = query.trim().toLowerCase();
    return data.generations.filter((entry) => {
      if (endpoint !== "all" && entry.type !== endpoint) return false;
      if (selectedSdks !== null && !selectedSdks.includes(entry.metadata.sdk)) return false;
      if (!search) return true;
      const lookupId = getGenerationLookupId(entry);
      const correlation = getGenerationCorrelationMetadata(entry);
      const haystack = `${entry.type} ${entry.metadata.model ?? ""} ${entry.metadata.provider ?? ""} ${entry.metadata.sdk ?? ""} ${entry.id} ${lookupId} ${getEntrySearchTerms(entry)}`.toLowerCase();
      const correlationHaystack = `${correlation.upstreamRequestId ?? ""} ${correlation.nativeResponseId ?? ""} ${correlation.sessionId ?? ""}`.toLowerCase();
      return `${haystack} ${correlationHaystack}`.includes(search);
    });
  }, [data?.generations, endpoint, query, selectedSdks]);

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, DevToolsEntry[]>();
    for (const entry of filtered) {
      const key = toLocalDateKey(entry.timestamp);
      const bucket = groups.get(key);
      if (bucket) {
        bucket.push(entry);
      } else {
        groups.set(key, [entry]);
      }
    }

    return Array.from(groups.entries()).map(([dateKey, entries]) => ({
      dateKey,
      entries
    }));
  }, [filtered]);

  const sdkSummary = useMemo(() => {
    if (selectedSdks === null) return "All SDKs";
    if (selectedSdks.length === 0) return "No SDKs";
    if (selectedSdks.length === 1) return getSdkLabel(selectedSdks[0]);
    return `${selectedSdks.length} SDKs`;
  }, [selectedSdks]);

  if (isLoading) {
    return (
      <div className="p-6 text-muted-foreground">Loading generations...</div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-destructive">
        Error: {error instanceof Error ? error.message : "Unknown error"}
      </div>
    );
  }

  if (!data || data.generations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <BarChart3 className="h-10 w-10 text-muted-foreground mb-4" />
        <div className="text-sm font-medium text-foreground mb-2">No Generations Yet</div>
        <p className="text-xs text-muted-foreground max-w-xs">
          Make API requests with the Phaseo SDK to see them appear here in real-time.
        </p>
        <div className="mt-6 rounded-xl border border-border/60 bg-card/80 p-4 text-left text-xs max-w-xs">
          <div className="font-medium mb-2">Quick Start:</div>
          <code className="block text-[10px] bg-muted/60 p-2 rounded">
            import {"{"} Phaseo {"}"} from '@phaseo/sdk'<br/>
            const client = new Phaseo()
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-border/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold">Generations</div>
            <div className="text-xs text-muted-foreground">
              Showing {filtered.length.toLocaleString()} of {data.total.toLocaleString()}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const dataStr = JSON.stringify(data.generations, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `phaseo-devtools-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="rounded-lg border border-border/60 bg-card/80 px-2 py-1 text-xs hover:bg-accent/40 transition"
              title="Export all as JSON"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by model, endpoint, provider, ID..."
              className="w-full rounded-xl border border-border bg-card px-3 py-2 pl-8 text-sm text-foreground placeholder:text-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
            <span className="absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none">
              <Search className="h-4 w-4" />
            </span>
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                title="Clear search (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {endpoints.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Endpoint</span>
              <Select value={endpoint} onValueChange={setEndpoint}>
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue placeholder="All endpoints" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All endpoints</SelectItem>
                  {endpoints.map((item) => (
                    <SelectItem key={item} value={item}>
                      {formatEndpointLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {sdkValues.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">SDK</span>
              <div className="relative flex-1" ref={sdkMenuRef}>
                <button
                  type="button"
                  className="flex h-8 w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground shadow-sm transition hover:bg-accent/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  onClick={() => setSdkMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={sdkMenuOpen}
                >
                  <span className="truncate">{sdkSummary}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>

                {sdkMenuOpen && (
                  <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
                    <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
                      <button
                        type="button"
                        className="text-[11px] text-primary hover:underline"
                        onClick={() => setSelectedSdks(null)}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                        onClick={() => setSelectedSdks([])}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="p-1">
                      {sdkValues.map((item) => {
                        const checked = selectedSdks === null || selectedSdks.includes(item);
                        return (
                          <button
                            key={item}
                            type="button"
                            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus:outline-none focus:bg-accent"
                            onClick={() => {
                              setSelectedSdks((previous) => toggleSdkSelection(previous, item, sdkValues));
                            }}
                          >
                            <SdkOptionLabel sdk={item} />
                            <span className="inline-flex h-4 w-4 items-center justify-center text-primary">
                              {checked ? <Check className="h-3.5 w-3.5" /> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-muted-foreground">
            No generations match your filters.
          </div>
        ) : (
          <div>
            {groupedByDate.map((group) => (
              <div key={group.dateKey} className="border-b border-border/50 last:border-b-0">
                <div className="sticky top-0 z-10 border-y border-border/50 bg-sidebar/95 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
                  {formatDateHeading(group.dateKey)}
                </div>
                <div className="divide-y divide-border/40">
                  {group.entries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => onSelect(entry.id)}
                      className={`w-full text-left p-4 transition relative ${
                        selectedId === entry.id
                          ? "bg-primary/10 border-l-4 border-l-primary"
                          : "hover:bg-accent/40 border-l-4 border-l-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">
                            {getEntryPrimaryLabel(entry)}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5">
                              {formatEndpointLabel(entry.type)}
                            </span>
                            <SdkBadge sdk={entry.metadata.sdk} />
                            {getEntryStatusHint(entry) ? (
                              <span className="rounded-full border border-border/60 bg-card/70 px-2 py-0.5">
                                {getEntryStatusHint(entry)}
                              </span>
                            ) : null}
                            {entry.error && (
                              <span className="inline-flex items-center gap-1 text-amber-600">
                                <AlertTriangle className="h-3 w-3" />
                                Error
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                            {entry.metadata.stream && (
                              <span className="rounded-full border border-border/60 bg-card/70 px-2 py-0.5">
                                Streaming
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-right pt-0.5">
                          <div className="text-xs text-muted-foreground">
                            {formatTimeOnly(entry.timestamp)}
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              entry.error
                                ? "bg-destructive/10 text-destructive border border-destructive/25"
                                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25"
                            }`}
                          >
                            {entry.error ? "Error" : "Success"}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type SdkBadgeConfig = {
  label: string;
  icon: string;
  darkIcon?: string;
};

const SDK_BADGE_MAP: Record<string, SdkBadgeConfig> = {
  typescript: { label: "TypeScript", icon: "/languages/typescript.svg" },
  python: { label: "Python", icon: "/languages/python.svg" },
  go: { label: "Go", icon: "/languages/golang_light.svg", darkIcon: "/languages/golang_dark.svg" },
  csharp: { label: "C#", icon: "/languages/csharp.svg" },
  java: { label: "Java", icon: "/languages/java.svg" },
  php: { label: "PHP", icon: "/languages/php_light.svg", darkIcon: "/languages/php_dark.svg" },
  ruby: { label: "Ruby", icon: "/languages/ruby.svg" },
  rust: { label: "Rust", icon: "/languages/rust_light.svg", darkIcon: "/languages/rust_dark.svg" },
  cpp: { label: "C++", icon: "/languages/c-plusplus.svg" }
};

function SdkBadge({ sdk }: { sdk?: string }) {
  if (!sdk) return null;
  const config = SDK_BADGE_MAP[sdk];

  if (!config) {
    return (
      <span className="rounded-full border border-border/60 bg-card/70 px-2 py-0.5 uppercase">
        {sdk}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/70 px-2 py-0.5">
      {config.darkIcon ? (
        <>
          <img src={config.icon} alt={`${config.label} logo`} className="h-3.5 w-3.5 dark:hidden" />
          <img src={config.darkIcon} alt={`${config.label} logo`} className="hidden h-3.5 w-3.5 dark:block" />
        </>
      ) : (
        <img src={config.icon} alt={`${config.label} logo`} className="h-3.5 w-3.5" />
      )}
      <span>{config.label}</span>
    </span>
  );
}

function getSdkLabel(sdk: string): string {
  return SDK_BADGE_MAP[sdk]?.label ?? sdk.toUpperCase();
}

function toggleSdkSelection(current: string[] | null, item: string, allValues: string[]): string[] | null {
  if (current === null) {
    const next = allValues.filter((value) => value !== item);
    return next.length === allValues.length ? null : next;
  }

  const nextSet = new Set(current);
  if (nextSet.has(item)) {
    nextSet.delete(item);
  } else {
    nextSet.add(item);
  }

  const next = Array.from(nextSet);
  return next.length === allValues.length ? null : next;
}

function SdkOptionLabel({ sdk }: { sdk: string }) {
  const config = SDK_BADGE_MAP[sdk];
  if (!config) {
    return <span className="text-sm">{sdk.toUpperCase()}</span>;
  }

  return (
    <span className="inline-flex items-center gap-2">
      {config.darkIcon ? (
        <>
          <img src={config.icon} alt={`${config.label} logo`} className="h-3.5 w-3.5 dark:hidden" />
          <img src={config.darkIcon} alt={`${config.label} logo`} className="hidden h-3.5 w-3.5 dark:block" />
        </>
      ) : (
        <img src={config.icon} alt={`${config.label} logo`} className="h-3.5 w-3.5" />
      )}
      <span>{config.label}</span>
    </span>
  );
}

function formatEndpointLabel(endpoint: string): string {
  return endpoint
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function toLocalDateKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateHeading(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  const today = new Date();
  const todayKey = toLocalDateKey(today.getTime());
  if (dateKey === todayKey) return "Today";

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = toLocalDateKey(yesterday.getTime());
  if (dateKey === yesterdayKey) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatTimeOnly(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function getEntryPrimaryLabel(entry: DevToolsEntry): string {
  if (typeof entry.metadata?.model === "string" && entry.metadata.model.trim().length > 0) {
    return entry.metadata.model;
  }

  const request = asRecord(entry.request);
  const response = asRecord(entry.response);

  if (entry.type.startsWith("batches.")) {
    return (
      firstNonEmpty(
        response.id,
        request.batch_id,
        response.input_file_id,
        request.input_file_id
      ) ?? "Batch job"
    );
  }

  if (entry.type.startsWith("files.")) {
    return firstNonEmpty(response.id, request.file_id, response.filename, request.filename) ?? "File request";
  }

  return "Unknown model";
}

function getEntryStatusHint(entry: DevToolsEntry): string | undefined {
  const response = asRecord(entry.response);
  if (entry.type.startsWith("batches.")) {
    return firstNonEmpty(response.status);
  }
  if (entry.type.startsWith("files.")) {
    return firstNonEmpty(response.status, response.purpose);
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

