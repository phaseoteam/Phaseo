import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { GenerationsList } from "./components/GenerationsList";
import { GenerationDetail } from "./components/GenerationDetail";
import { StatsOverview } from "./components/StatsOverview";
import type { DevToolsEntry } from "@ai-stats/devtools-core";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 2000, // Poll every 2 seconds
      staleTime: 1000
    }
  }
});

export function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"generations" | "stats">("generations");

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen bg-background text-foreground">
        {/* Header */}
        <div className="fixed top-0 left-0 right-0 h-14 bg-primary text-primary-foreground flex items-center px-6 z-10 shadow-md">
          <h1 className="text-xl font-bold">AI Stats DevTools</h1>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setView("generations")}
              className={`px-4 py-2 rounded ${
                view === "generations"
                  ? "bg-primary-foreground text-primary"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              Generations
            </button>
            <button
              onClick={() => setView("stats")}
              className={`px-4 py-2 rounded ${
                view === "stats"
                  ? "bg-primary-foreground text-primary"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              Stats
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 pt-14">
          {view === "generations" ? (
            <>
              {/* Sidebar */}
              <div className="w-80 border-r border-border overflow-y-auto">
                <GenerationsList
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </div>

              {/* Detail View */}
              <div className="flex-1 overflow-y-auto">
                {selectedId ? (
                  <GenerationDetail id={selectedId} />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Select a generation to view details
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <StatsOverview />
            </div>
          )}
        </div>
      </div>
    </QueryClientProvider>
  );
}
