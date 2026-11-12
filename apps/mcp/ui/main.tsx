import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { money, type CardModel, type Model } from "./model";
import { ModelComparison } from "./ModelComparison";
import { ArrowLeft, Search, X } from "lucide-react";
import { ModelDetails } from "./ModelDetails";
import { ModelListItem } from "./ModelListItem";
import { CardSkeleton, cardFor, CreditsCard, EstimateCard, ModelsCard } from "./Cards";
import { bridge, canOpenFullscreen, openFullscreen, readResult, useBridge } from "./bridge";
import { linkedModels, modelLink, modelContext } from "./integration";
import { ModalityIcon } from "./modality";
import { SavedShortlists } from "./SavedShortlists";
import { UsageDashboard } from "./UsageDashboard";
import { PromptComparison } from "./PromptComparison";

type Theme = "light" | "dark";

// Visible controls rather than dropdown menus, as both hosts' guidelines ask:
// menus get clipped by the host container and are awkward on touch screens.
const MODALITY_TABS = [
  { value: "", label: "All" },
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "audio", label: "Audio" },
  { value: "video", label: "Video" },
];
const SORTS = [
  { value: "relevance", label: "Relevance" },
  { value: "release_date", label: "Newest" },
  { value: "input_price", label: "Cheapest input" },
  { value: "output_price", label: "Cheapest output" },
  { value: "context_length", label: "Longest context" },
  { value: "provider_count", label: "Most providers" },
];

type Filters = {
  query: string;
  provider: string;
  modality: string;
  sortBy: string;
  gatewayOnly: boolean;
};

type CompareSeed = { id: number; models: CardModel[] | null };

function Explorer({
  initialModels,
  seed,
  theme,
}: {
  initialModels: CardModel[];
  seed: CompareSeed;
  theme: Theme;
}) {
  const initialCompare = seed.models;
  const { status, context, toolCall, result } = useBridge();
  const connected = status === "connected";
  const [models, setModels] = useState<CardModel[]>(initialModels);
  const [query, setQuery] = useState("");
  const [modality, setModality] = useState("");
  const [provider, setProvider] = useState("");
  const [selected, setSelected] = useState<CardModel[]>(initialCompare ?? []);
  const [detail, setDetail] = useState<CardModel | null>(null);
  const [compare, setCompare] = useState(
    Boolean(initialCompare && initialCompare.length > 1),
  );
  const [busy, setBusy] = useState(initialModels.length === 0);
  const [error, setError] = useState("");
  const [estimates, setEstimates] = useState<Record<string, string>>({});
  const [inputTokens, setInputTokens] = useState("1000");
  const [outputTokens, setOutputTokens] = useState("1000");
  const [estimating, setEstimating] = useState(false);
  const [sortBy, setSortBy] = useState("relevance");
  const [gatewayOnly, setGatewayOnly] = useState(false);
  const [notice, setNotice] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [link, setLink] = useState("");
  const [page, setPage] = useState("models");
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const workflowBusyRef = useRef(false);
  function setRunBusy(value: boolean) {
    workflowBusyRef.current = value;
    setWorkflowBusy(value);
  }
  const linkRequest = useRef(0);
  const request = useRef(0);
  const textEdited = useRef(false);
  // The model whose page was open, so closing it returns focus to its row.
  const returnFocusTo = useRef<string | null>(null);
  const detailRequest = useRef(0);

  // The explorer stays mounted across display modes, so "Compare these" on a card
  // replaces the shortlist here, unless a paid comparison run is still going.
  const appliedSeed = useRef(seed.id);
  useEffect(() => {
    if (seed.id === appliedSeed.current) return;
    appliedSeed.current = seed.id;
    if (!seed.models || workflowBusyRef.current) return;
    ++detailRequest.current;
    setDetail(null);
    setEstimates({});
    setSelected(seed.models);
    setCompare(seed.models.length > 1);
    setPage("models");
  }, [seed]);

  // A newer models_list result from the conversation replaces the list, and wins
  // over any search still in flight.
  useEffect(() => {
    if (initialModels.length) {
      ++request.current;
      setModels(initialModels);
      setBusy(false);
    }
  }, [initialModels]);
  // A tool result without models (an error, or another tool's data) ends loading.
  useEffect(() => {
    if (result && !initialModels.length) setBusy(false);
  }, [result]);

  // Opened without a tool call (a host entry point): load a first page.
  // A model-invoked tool sends its arguments just after connecting, so wait briefly
  // and never search over a tool call's own result.
  const toolCallRef = useRef(toolCall);
  toolCallRef.current = toolCall;
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (!connected || loadedOnce.current) return;
    loadedOnce.current = true;
    if (initialModels.length || toolCallRef.current) return;
    const timer = setTimeout(() => {
      if (!toolCallRef.current) void search();
    }, 800);
    return () => clearTimeout(timer);
  }, [connected]);

  const deepLink = (context?.["openai/deepLink"] as { url?: string } | undefined)?.url;
  useEffect(() => {
    if (connected && deepLink) void restoreLink(deepLink);
  }, [connected, deepLink]);

  useEffect(() => {
    if (status === "failed") {
      setBusy(false);
      setError(
        "Open the model explorer from the connected Phaseo plugin to load live data.",
      );
    }
  }, [status]);

  async function restoreLink(path: string) {
    if (workflowBusyRef.current) {
      setNotice(
        "Wait for the current run to finish before opening another model link.",
      );
      return;
    }
    setPage("models");
    const sequence = ++linkRequest.current;
    ++detailRequest.current;
    setDetail(null);
    setCompare(false);
    setEstimates({});
    setError("");
    setLink("");
    setNotice("");
    try {
      const ids = linkedModels(path);
      const restored = await Promise.all(
        ids.map(async (modelId) => {
          const data = readResult(
            await bridge.callServerTool({
              name: "model_get",
              arguments: { modelId },
            }),
          );
          if (!data.model || typeof data.model !== "object")
            throw new Error("Incomplete linked model details.");
          return data.model as CardModel;
        }),
      );
      if (sequence !== linkRequest.current) return;
      setSelected(restored);
      if (restored.length === 1) setDetail(restored[0]);
      setCompare(restored.length > 1);
    } catch (reason) {
      if (sequence === linkRequest.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not open model link.",
        );
    }
  }

  async function callTool(name: string, args: Record<string, unknown> = {}) {
    return readResult(
      await bridge.callServerTool(
        { name, arguments: args },
        name === "inference_run" ? { timeout: 150_000 } : undefined,
      ),
    );
  }

  async function useInChat(items: CardModel[]) {
    setAttaching(true);
    setNotice("");
    setError("");
    try {
      await bridge.updateModelContext(modelContext(items));
      setNotice(
        `${items.length === 1 ? items[0].name : "Shortlist"} added as context for your next message.`,
      );
    } catch {
      setError(
        "This host could not attach model context. Try again or use the model IDs in your message.",
      );
    } finally {
      setAttaching(false);
    }
  }

  // Tabs, sort and toggles search as soon as they change, with their new value.
  function applyFilter(change: Partial<Filters>) {
    if (change.modality !== undefined) setModality(change.modality);
    if (change.sortBy !== undefined) setSortBy(change.sortBy);
    if (change.gatewayOnly !== undefined) setGatewayOnly(change.gatewayOnly);
    if (change.query !== undefined) setQuery(change.query);
    void search(undefined, change);
  }

  async function search(event?: FormEvent, change: Partial<Filters> = {}) {
    event?.preventDefault();
    const filters: Filters = { query, provider, modality, sortBy, gatewayOnly, ...change };
    const sequence = ++request.current;
    setBusy(true);
    setError("");
    try {
      const data = readResult(
        await bridge.callServerTool({
          name: "models_list",
          arguments: {
            ...(filters.query.trim() ? { query: filters.query.trim() } : {}),
            ...(filters.modality ? { modality: filters.modality } : {}),
            ...(filters.provider.trim() ? { provider: filters.provider.trim() } : {}),
            limit: 20,
            sortBy: filters.sortBy,
            gatewayAvailableOnly: filters.gatewayOnly,
          },
        }),
      );
      if (!Array.isArray(data.models))
        throw new Error("Phaseo returned an incomplete model list. Try again.");
      if (sequence === request.current) setModels(data.models as CardModel[]);
    } catch (reason) {
      if (sequence === request.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Search failed. Try again.",
        );
    } finally {
      if (sequence === request.current) setBusy(false);
    }
  }

  async function openDetail(model: CardModel) {
    const sequence = ++detailRequest.current;
    setDetail(model);
    setError("");
    try {
      const data = readResult(
        await bridge.callServerTool({
          name: "model_get",
          arguments: { modelId: model.id },
        }),
      );
      if (!data.model || typeof data.model !== "object")
        throw new Error("Phaseo returned incomplete model details.");
      if (sequence === detailRequest.current) {
        setDetail({ ...model, ...(data.model as CardModel) });
        setSelected((current) =>
          current.map((item) =>
            item.id === model.id ? ({ ...model, ...(data.model as CardModel) }) : item,
          ),
        );
      }
    } catch (reason) {
      if (sequence === detailRequest.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not refresh model details.",
        );
    }
  }

  function toggle(model: CardModel) {
    setEstimates({});
    setSelected((current) =>
      current.some((item) => item.id === model.id)
        ? current.filter((item) => item.id !== model.id)
        : current.length < 3
          ? [...current, model]
          : current,
    );
  }

  async function estimate(event: FormEvent) {
    event.preventDefault();
    const input = Number(inputTokens),
      output = Number(outputTokens);
    if (
      ![input, output].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      )
    ) {
      setError("Enter whole, non-negative token counts.");
      return;
    }
    setEstimating(true);
    setError("");
    const values = await Promise.all(
      selected.map(async (model) => {
        try {
          const data = readResult(
            await bridge.callServerTool({
              name: "cost_estimate",
              arguments: {
                modelId: model.id,
                inputTokens: input,
                outputTokens: output,
              },
            }),
          );
          const result = data.estimate as {
            totalCostUSD: number;
            providerId?: string;
          };
          if (!Number.isFinite(result?.totalCostUSD))
            throw new Error("Incomplete cost estimate");
          return [
            model.id,
            `${money(result.totalCostUSD)}${result.providerId ? ` · ${result.providerId}` : ""}`,
          ];
        } catch {
          return [model.id, "Estimate unavailable"];
        }
      }),
    );
    setEstimates(Object.fromEntries(values));
    setEstimating(false);
  }

  const closeDetail = () => {
    ++detailRequest.current;
    setDetail((current) => {
      if (current) returnFocusTo.current = current.id;
      return null;
    });
  };
  useEffect(() => {
    if (detail || !returnFocusTo.current) return;
    const id = returnFocusTo.current;
    returnFocusTo.current = null;
    const target = [...document.querySelectorAll<HTMLButtonElement>(".model-name")].find(
      (button) => button.dataset.modelId === id,
    );
    target?.focus();
  }, [detail]);
  // Typing in the search or provider field searches after a short pause.
  useEffect(() => {
    if (!textEdited.current) return;
    const timer = setTimeout(() => void search(), 350);
    return () => clearTimeout(timer);
  }, [query, provider]);
  // Copies a model link, or shows it to copy by hand when the host blocks the clipboard.
  const [copied, setCopied] = useState(false);
  async function copyLink(ids: string[]) {
    const url = modelLink(ids);
    try {
      await navigator.clipboard.writeText(url);
      setLink("");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setLink(url);
      setTimeout(() => document.getElementById("model-link")?.focus(), 0);
    }
  }
  const goTo = (next: string) => {
    closeDetail();
    if (next === "models") setCompare(false);
    setPage(next);
  };
  const showingDetail = page === "models" && detail !== null;
  const showingCompare = page === "models" && compare && !showingDetail;
  const back =
    showingDetail || showingCompare || page === "try"
      ? () => {
          if (showingDetail) closeDetail();
          else {
            setCompare(false);
            setPage("models");
          }
        }
      : null;
  const title =
    page === "saved"
      ? "Shortlists"
      : page === "usage"
        ? "Usage"
        : page === "try"
          ? "Try a prompt"
          : showingCompare
            ? "Compare models"
            : "Models";
  return (
    <main className="explorer">
      <nav className="view-tabs" aria-label="Phaseo views">
        {[
          ["models", "Models"],
          ["saved", "Shortlists"],
          ["usage", "Usage"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={workflowBusy}
            aria-current={(page === value || (value === "models" && page === "try")) ? "page" : undefined}
            onClick={() => goTo(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {back && (
        <button type="button" className="back-link" disabled={workflowBusy} onClick={back}>
          <ArrowLeft aria-hidden="true" />
          Models
        </button>
      )}
      {!showingDetail && (
        <div className="page-head">
          <h1>{title}</h1>
        </div>
      )}
      {error && (
        <div role="alert" className="alert alert-danger">
          {error}
        </div>
      )}
      {notice && (
        <p role="status" className="alert">
          {notice}
        </p>
      )}
      {link && (
        <div className="share-link">
          <label htmlFor="model-link">Link</label>
          <input
            id="model-link"
            readOnly
            value={link}
            onFocus={(event) => event.target.select()}
          />
          <button type="button" className="icon-button" aria-label="Close link" onClick={() => setLink("")}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}
      {page === "saved" ? (
        <SavedShortlists
          models={selected}
          onOpen={(ids) =>
            void restoreLink(
              `/models?${new URLSearchParams({ ids: ids.join(",") })}`,
            )
          }
        />
      ) : page === "usage" ? (
        <UsageDashboard callTool={callTool} />
      ) : page === "try" ? (
        <PromptComparison
          key={selected.map((model) => model.id).join(",")}
          models={selected}
          callTool={callTool}
          onBusyChange={setRunBusy}
        />
      ) : showingDetail ? (
        <ModelDetails
          model={detail}
          theme={theme}
          selected={selected.some((item) => item.id === detail.id)}
          disabled={
            estimating ||
            (!selected.some((item) => item.id === detail.id) &&
              selected.length === 3)
          }
          onClose={closeDetail}
          onToggle={() => toggle(detail)}
          onUse={() => void useInChat([detail])}
          onLink={() => void copyLink([detail.id])}
          copied={copied}
          attaching={attaching}
        />
      ) : !compare ? (
        <>
          <form className="toolbar" role="search" onSubmit={search}>
            <label className="search-field">
              <Search aria-hidden="true" />
              <span className="sr-only">Search models</span>
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  textEdited.current = true;
                  setQuery(event.target.value);
                }}
                placeholder="Search models…"
                maxLength={200}
                enterKeyHint="search"
              />
            </label>
            <label className="search-field provider-field">
              <span className="sr-only">Provider</span>
              <input
                value={provider}
                onChange={(event) => {
                  textEdited.current = true;
                  setProvider(event.target.value);
                }}
                placeholder="Any provider"
                maxLength={100}
                enterKeyHint="search"
              />
            </label>
          </form>
          <div className="modality-tabs" role="group" aria-label="Input modality">
            {MODALITY_TABS.map((tab) => (
              <button
                key={tab.value || "all"}
                type="button"
                aria-pressed={modality === tab.value}
                disabled={!connected}
                onClick={() => applyFilter({ modality: tab.value })}
              >
                {tab.value ? <ModalityIcon value={tab.value} /> : null}
                {tab.label}
              </button>
            ))}
          </div>
          <div className="chip-row" role="group" aria-label="Sort and filter">
            <button
              type="button"
              className="toggle-chip"
              aria-pressed={gatewayOnly}
              disabled={!connected}
              onClick={() => applyFilter({ gatewayOnly: !gatewayOnly })}
            >
              On the Gateway
            </button>
            <span className="chip-divider" aria-hidden="true" />
            {SORTS.map((sort) => (
              <button
                key={sort.value}
                type="button"
                className="toggle-chip"
                aria-pressed={sortBy === sort.value}
                disabled={!connected}
                onClick={() => applyFilter({ sortBy: sort.value })}
              >
                {sort.label}
              </button>
            ))}
          </div>
          <p className="results-meta" role="status">
            {busy
              ? "Loading models…"
              : `${models.length} ${models.length === 1 ? "model" : "models"}${models.length === 20 ? " · first 20 shown, refine to narrow" : ""}`}
            {!busy && models.length > 0 && (
              <span className="results-note">
                Lowest listed prices per 1M tokens. Input and output can come from
                different providers; open a model to see which.
              </span>
            )}
          </p>
          <section aria-label="Models" aria-busy={busy} className="model-grid">
            {busy && !models.length
              ? [0, 1, 2, 3].map((index) => (
                  <div className="model-item" key={index} aria-hidden="true">
                    <div className="model-head">
                      <span className="logo skeleton" />
                      <div className="skeleton-stack">
                        <span className="skeleton" style={{ width: "55%" }} />
                        <span className="skeleton" style={{ width: "35%" }} />
                      </div>
                    </div>
                    <span className="skeleton" style={{ width: "80%", height: 22 }} />
                    <span className="skeleton" style={{ width: "45%" }} />
                  </div>
                ))
              : null}
            {!busy && !models.length && (
              <div className="empty">
                <h2>No models found</h2>
                <p>Try a different keyword or clear a filter.</p>
              </div>
            )}
            {models.map((model) => {
              const checked = selected.some((item) => item.id === model.id);
              return (
                <ModelListItem
                  key={model.id}
                  model={model}
                  theme={theme}
                  selected={checked}
                  selectDisabled={estimating || selected.length === 3}
                  onToggle={() => toggle(model)}
                  onOpen={() => void openDetail(model)}
                />
              );
            })}
          </section>
          {selected.length > 0 && (
            <footer className="tray" aria-label="Shortlist">
              <div className="tray-summary">
                <strong>
                  {selected.length} of 3 in your shortlist
                </strong>
                <span>{selected.map((model) => model.name).join(", ")}</span>
              </div>
              <div className="tray-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={selected.length < 2}
                  title={selected.length < 2 ? "Add another model to compare" : undefined}
                  onClick={() => {
                    closeDetail();
                    setCompare(true);
                  }}
                >
                  Compare
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeDetail();
                    setPage("try");
                  }}
                >
                  Try a prompt
                </button>
                <button
                  type="button"
                  disabled={attaching}
                  onClick={() => void useInChat(selected)}
                >
                  Add to chat
                </button>
                <button
                  type="button"
                  onClick={() => void copyLink(selected.map((model) => model.id))}
                >
                  {copied ? "Link copied" : "Copy link"}
                </button>
              </div>
            </footer>
          )}
        </>
      ) : (
        <>
          <ModelComparison models={selected} theme={theme} />
          <div className="button-row">
            <button
              type="button"
              disabled={attaching}
              onClick={() => void useInChat(selected)}
            >
              Add to chat
            </button>
            <button
              type="button"
              onClick={() => void copyLink(selected.map((model) => model.id))}
            >
              {copied ? "Link copied" : "Copy comparison link"}
            </button>
          </div>
          <section className="section">
            <h2>What would it cost?</h2>
            <form className="inline-form" onSubmit={estimate}>
              <label>
                Input tokens
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={inputTokens}
                  onChange={(event) => {
                    setInputTokens(event.target.value);
                    setEstimates({});
                  }}
                  disabled={estimating}
                />
              </label>
              <label>
                Output tokens
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={outputTokens}
                  onChange={(event) => {
                    setOutputTokens(event.target.value);
                    setEstimates({});
                  }}
                  disabled={estimating}
                />
              </label>
              <button className="primary" disabled={estimating}>
                {estimating ? "Estimating…" : "Estimate"}
              </button>
            </form>
            <dl className="estimate-results" aria-live="polite">
              {selected.map(
                (model) =>
                  estimates[model.id] && (
                    <div key={model.id}>
                      <dt>{model.name}</dt>
                      <dd>{estimates[model.id]}</dd>
                    </div>
                  ),
              )}
            </dl>
            <p className="note">
              USD estimates from current listed token pricing. Excludes caching
              discounts and other charges; actual billing may differ.
            </p>
          </section>
          <PromptComparison
            key={selected.map((model) => model.id).join(",")}
            models={selected}
            callTool={callTool}
            onBusyChange={setRunBusy}
          />
        </>
      )}
    </main>
  );
}

// Tool results render as inline cards. The explorer appears in fullscreen, when the
// user expands a card on a host without fullscreen, or when it was opened from the
// host without a tool call.
function Root() {
  const { status, context, toolCall, result } = useBridge();
  const [graceOver, setGraceOver] = useState(false);
  const [expandedInline, setExpandedInline] = useState(false);
  const [seed, setSeed] = useState<CompareSeed>({ id: 0, models: null });
  const [explorerMounted, setExplorerMounted] = useState(false);
  useEffect(() => {
    if (status !== "connected") return;
    // Tool arguments arrive just after connecting; wait briefly before deciding
    // this view was opened from an entry point instead.
    const timer = setTimeout(() => setGraceOver(true), 800);
    return () => clearTimeout(timer);
  }, [status]);

  const theme: Theme = context?.theme === "dark" ? "dark" : "light";
  const fullscreen = context?.displayMode === "fullscreen";
  // Parse once per tool result, so host-context renders (theme, display mode) keep
  // the same models array and never invalidate a search the user started.
  const { card, error } = useMemo(() => {
    if (!result) return { card: null, error: "" };
    try {
      return { card: cardFor(readResult(result)), error: "" };
    } catch (reason) {
      return {
        card: null,
        error: reason instanceof Error ? reason.message : "Phaseo could not load this data.",
      };
    }
  }, [result]);
  const resultModels = card?.kind === "models" ? card.models : NO_MODELS;

  const showExplorer =
    fullscreen ||
    expandedInline ||
    status === "failed" ||
    (status === "connected" && !toolCall && graceOver);
  // Once opened, the explorer stays mounted (hidden while the card shows) so leaving
  // fullscreen keeps its shortlist, prompt and any comparison run still in flight.
  useEffect(() => {
    if (showExplorer) setExplorerMounted(true);
  }, [showExplorer]);

  let inline = null;
  if (showExplorer) {
    // The explorer is showing; no card.
  } else if (error)
    inline = (
      <section className="card">
        <p role="alert" className="card-error">{error}</p>
      </section>
    );
  else if (!card) inline = <CardSkeleton tool={context?.toolInfo?.tool.name} />;
  else if (card.kind === "estimate") inline = <EstimateCard estimate={card.estimate} />;
  else if (card.kind === "credits") inline = <CreditsCard credits={card.credits} />;
  else
    inline = (
      <ModelsCard
        models={card.models}
        theme={theme}
        canExpand={status === "connected"}
        onExpand={async (compare) => {
          setSeed((current) => ({ id: current.id + 1, models: compare }));
          if (canOpenFullscreen(context) && (await openFullscreen())) return;
          setExpandedInline(true);
        }}
      />
    );
  return (
    <>
      {(explorerMounted || showExplorer) && (
        <div hidden={!showExplorer}>
          <Explorer initialModels={resultModels} seed={seed} theme={theme} />
        </div>
      )}
      {inline}
    </>
  );
}

const NO_MODELS: CardModel[] = [];

createRoot(document.getElementById("root")!).render(<Root />);
