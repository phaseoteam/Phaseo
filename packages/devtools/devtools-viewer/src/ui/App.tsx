import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Keyboard, Moon, RefreshCw, Sun, X } from "lucide-react";
import { useState, useEffect } from "react";
import { GenerationsList } from "./components/GenerationsList";
import { GenerationDetail } from "./components/GenerationDetail";
import { ErrorBoundary } from "./components/ErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 2000, // Poll every 2 seconds
      staleTime: 1000
    }
  }
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}

function AppShell() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    // Check localStorage or system preference
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('devtools-dark-mode');
      if (stored) return stored === 'true';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('devtools-dark-mode', String(darkMode));
  }, [darkMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';

      // Show shortcuts with ?
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !isInputFocused) {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }

      // Focus search with /
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !isInputFocused) {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
        searchInput?.focus();
        return;
      }

      // Close modals with Escape
      if (e.key === 'Escape') {
        if (showShortcuts) {
          setShowShortcuts(false);
        } else if (isInputFocused) {
          // Blur the input and clear it if it's the search
          (activeElement as HTMLInputElement).blur();
        } else if (selectedId) {
          setSelectedId(null);
        }
        return;
      }

      // Copy generation ID with Cmd/Ctrl+C when a generation is selected
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selectedId && !e.shiftKey && !isInputFocused) {
        e.preventDefault();
        navigator.clipboard.writeText(selectedId);
        console.log('Copied generation ID:', selectedId);
        return;
      }

      // Toggle dark mode with Cmd/Ctrl+D
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        setDarkMode(!darkMode);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showShortcuts, selectedId, darkMode]);
  const handleRefresh = () => {
    queryClient.refetchQueries({ queryKey: ["generations"] });
  };
  return (
    <div className="h-screen bg-background text-foreground overflow-hidden">
      <div className="flex h-full">
        {/* Sidebar with Generations List */}
        <aside className="hidden lg:flex w-96 flex-col border-r border-border/60 bg-sidebar text-sidebar-foreground h-full">
          <div className="px-6 py-4 border-b border-sidebar-border min-h-[72px] flex items-center">
            <div className="flex items-center gap-3">
              <img
                src={darkMode ? "/wordmark_dark.svg" : "/wordmark_light.svg"}
                alt="AI Stats"
                className="h-7"
              />
              <div className="text-lg font-semibold">Devtools</div>
            </div>
          </div>

          {/* Generations List - Always visible */}
          <div className="flex-1 overflow-hidden">
            <GenerationsList
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          <div className="px-6 py-4 border-t border-sidebar-border">
            <div className="text-xs text-muted-foreground">
              Devtools Viewer
            </div>
          </div>
        </aside>

        <div className="flex-1 h-full flex flex-col">
          <header className="border-b border-border/60 bg-background/85 backdrop-blur">
            <div className="px-6 py-4 min-h-[72px] flex items-center">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/70 px-3 py-1 text-xs text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Connected
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleRefresh}
                    className="rounded-full border border-border/60 bg-card/80 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
                    title="Refresh data"
                  >
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      Refresh
                    </span>
                  </button>
                  <button
                    onClick={() => setShowShortcuts(!showShortcuts)}
                    className="rounded-full border border-border/60 bg-card/80 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
                    title="Keyboard shortcuts (Press ?)"
                  >
                    <Keyboard className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDarkMode(!darkMode)}
                    className="rounded-full border border-border/60 bg-card/80 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
                    title={`Switch to ${darkMode ? 'light' : 'dark'} mode (⌘D)`}
                  >
                    {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-hidden">
            <section className="h-full px-0 py-0 overflow-auto">
              <ErrorBoundary
                title="Unable to render this generation"
                onReset={() => setSelectedId(null)}
              >
                {selectedId ? (
                  <GenerationDetail id={selectedId} />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center p-10 text-muted-foreground min-h-[400px]">
                    <div className="text-base font-medium text-foreground">
                      Select a generation
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                      Choose a request from the sidebar to inspect prompts, responses,
                      tool calls, and pricing breakdowns.
                    </p>
                  </div>
                )}
              </ErrorBoundary>
            </section>
          </main>
        </div>
      </div>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-slide-in"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="bg-background rounded-2xl border border-border/60 p-6 max-w-lg shadow-2xl animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Keyboard Shortcuts</h3>
              <button
                onClick={() => setShowShortcuts(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <ShortcutRow keys={["?"]} description="Show this help" />
              <ShortcutRow keys={["Escape"]} description="Close modal / Blur input / Deselect" />
              <ShortcutRow keys={["Cmd/Ctrl", "C"]} description="Copy generation ID" />
              <ShortcutRow keys={["Cmd/Ctrl", "D"]} description="Toggle dark mode" />
              <ShortcutRow keys={["/"]} description="Focus search" />
            </div>
            <div className="mt-6 pt-4 border-t border-border/60 text-xs text-muted-foreground">
              <div className="font-medium mb-2">Quick Actions</div>
              <div className="space-y-1">
                <div>• Click any Copy button to copy to clipboard</div>
                <div>• Use filters to find specific requests</div>
                <div>• Click generation ID to copy it</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ShortcutRowProps {
  keys: string[];
  description: string;
}

function ShortcutRow({ keys, description }: ShortcutRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-foreground">{description}</span>
      <div className="flex gap-1">
        {keys.map((key, idx) => (
          <kbd
            key={idx}
            className="px-2 py-1 text-xs rounded border border-border/60 bg-muted/60 font-mono"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );
}
