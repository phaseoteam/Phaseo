import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { money, type CardModel, type Model } from "./model";
import { ModelComparison } from "./ModelComparison";
import { ModelDetails } from "./ModelDetails";
import { ModelRow } from "./ModelRow";
import { cardFor, CreditsCard, EstimateCard, ModelsCard } from "./Cards";
import { bridge, canOpenFullscreen, openFullscreen, readResult, useBridge } from "./bridge";
import { linkedModels, modelLink, modelContext } from "./integration";
import { SavedShortlists } from "./SavedShortlists";
import { UsageDashboard } from "./UsageDashboard";
import { PromptComparison } from "./PromptComparison";
import { SelectField } from "./Select";

type Theme = "light" | "dark";

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
  const [selected, setSelected] = useState<Model[]>(initialCompare ?? []);
  const [detail, setDetail] = useState<Model | null>(null);
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

  // Opened from the sidebar or thread panel with no tool call: load a first page.
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
          return data.model as Model;
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

  async function useInChat(items: Model[]) {
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

  async function search(event?: FormEvent) {
    event?.preventDefault();
    const sequence = ++request.current;
    setBusy(true);
    setError("");
    try {
      const data = readResult(
        await bridge.callServerTool({
          name: "models_list",
          arguments: {
            ...(query.trim() ? { query: query.trim() } : {}),
            ...(modality ? { modality } : {}),
            ...(provider.trim() ? { provider: provider.trim() } : {}),
            limit: 20,
            sortBy,
            gatewayAvailableOnly: gatewayOnly,
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

  async function openDetail(model: Model) {
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
        setDetail(data.model as Model);
        setSelected((current) =>
          current.map((item) =>
            item.id === model.id ? (data.model as Model) : item,
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

  function toggle(model: Model) {
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
    setDetail(null);
  };
  return (
    <main className="explorer">
      <nav className="explorer-tabs" aria-label="Phaseo views">
        <button
          disabled={workflowBusy}
          aria-pressed={page === "models"}
          onClick={() => setPage("models")}
        >
          Models
        </button>
        <button
          disabled={workflowBusy}
          aria-pressed={page === "saved"}
          onClick={() => {
            closeDetail();
            setPage("saved");
          }}
        >
          Saved shortlists
        </button>
        <button
          disabled={workflowBusy}
          aria-pressed={page === "usage"}
          onClick={() => {
            closeDetail();
            setPage("usage");
          }}
        >
          Usage
        </button>
      </nav>
      <div className="heading">
        <div>
          <h1>
            {page === "saved"
              ? "Your shortlists"
              : page === "usage"
                ? "Your workspace usage"
                : page === "try"
                  ? "Test your shortlist"
                  : compare
                    ? "Compare your shortlist"
                    : "Find your next model"}
          </h1>
        </div>
        {((page === "models" && compare) || page === "try") && (
          <button
            disabled={workflowBusy}
            onClick={() => {
              setCompare(false);
              setPage("models");
            }}
          >
            Back to models
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {notice && (
        <p role="status" className="note">
          {notice}
        </p>
      )}
      {link && (
        <div className="share-link">
          <label htmlFor="model-link">Model link</label>
          <input
            id="model-link"
            readOnly
            value={link}
            onFocus={(event) => event.target.select()}
          />
          <button onClick={() => setLink("")}>Close link</button>
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
      ) : !compare ? (
        <>
          <form className="filters" onSubmit={search}>
            <label>
              Search
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Model name or keyword"
                maxLength={200}
              />
            </label>
            <label>
              Provider
              <input
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                placeholder="Any provider"
                maxLength={100}
              />
            </label>
            <label>
              Modality
              <SelectField
                label="Modality"
                value={modality}
                onValueChange={setModality}
                options={[
                  { value: "", label: "Any input" },
                  ...["text", "image", "audio", "video"].map((value) => ({
                    value,
                    label: value,
                  })),
                ]}
              />
            </label>
            <button className="primary" disabled={!connected || busy}>
              {busy ? "Searching…" : "Search"}
            </button>
            <label>
              Sort by
              <SelectField
                label="Sort by"
                value={sortBy}
                onValueChange={setSortBy}
                options={[
                  { value: "relevance", label: "Relevance" },
                  { value: "input_price", label: "Input price" },
                  { value: "output_price", label: "Output price" },
                  { value: "context_length", label: "Context length" },
                  { value: "provider_count", label: "Provider count" },
                ]}
              />
            </label>
            <label className="gateway-filter">
              <input
                type="checkbox"
                checked={gatewayOnly}
                onChange={(event) => setGatewayOnly(event.target.checked)}
              />
              Available through Gateway
            </label>
          </form>
          <div className="list-heading">
            <span role="status">
              {busy
                ? "Loading models…"
                : `${models.length} ${models.length === 1 ? "result" : "results"} · up to 20 per search`}
            </span>
            <span>Lowest paid price per 1M tokens</span>
          </div>
          <section aria-label="Models" aria-busy={busy} className="models">
            {!busy && !models.length && (
              <div className="empty">
                <h2>No models found</h2>
                <p>Try a different keyword or broaden your filters.</p>
              </div>
            )}
            {models.map((model) => {
              const checked = selected.some((item) => item.id === model.id);
              return (
                <ModelRow
                  key={model.id}
                  model={model}
                  theme={theme}
                  onOpen={() => void openDetail(model)}
                  leading={
                    <label className="select-model">
                      <input
                        type="checkbox"
                        aria-label={`Compare ${model.name}`}
                        checked={checked}
                        disabled={
                          estimating || (!checked && selected.length === 3)
                        }
                        onChange={() => toggle(model)}
                      />
                    </label>
                  }
                />
              );
            })}
          </section>
          <footer className="shortlist">
            <div>
              <strong>{selected.length} / 3 selected</strong>
              <span>
                {selected.length
                  ? selected.map((model) => model.name).join(" · ")
                  : "Select models to compare capabilities and costs."}
              </span>
            </div>
            <button
              className="primary"
              disabled={selected.length < 2}
              onClick={() => {
                closeDetail();
                setCompare(true);
              }}
            >
              Compare models
            </button>
            <button
              disabled={!selected.length || attaching}
              onClick={() => void useInChat(selected)}
            >
              Add to chat context
            </button>
            <button
              disabled={!selected.length}
              onClick={() =>
                setLink(modelLink(selected.map((model) => model.id)))
              }
            >
              Get link
            </button>
            <button
              disabled={!selected.length}
              onClick={() => {
                closeDetail();
                setPage("try");
              }}
            >
              Try prompt
            </button>
          </footer>
        </>
      ) : (
        <>
          <ModelComparison models={selected} />
          <div className="integration-actions">
            <button
              disabled={attaching}
              onClick={() => void useInChat(selected)}
            >
              Add to chat context
            </button>
            <button
              onClick={() =>
                setLink(modelLink(selected.map((model) => model.id)))
              }
            >
              Get comparison link
            </button>
          </div>
          <section className="calculator">
            <h2>What would it cost?</h2>
            <form onSubmit={estimate}>
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
                {estimating ? "Estimating…" : "Estimate costs"}
              </button>
            </form>
            <div className="estimate-results" aria-live="polite">
              {selected.map(
                (model) =>
                  estimates[model.id] && (
                    <div key={model.id}>
                      <span>{model.name}</span>
                      <strong>{estimates[model.id]}</strong>
                    </div>
                  ),
              )}
            </div>
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
      {detail && (
        <ModelDetails
          model={detail}
          selected={selected.some((item) => item.id === detail.id)}
          disabled={
            estimating ||
            (!selected.some((item) => item.id === detail.id) &&
              selected.length === 3)
          }
          onClose={closeDetail}
          onToggle={() => toggle(detail)}
          onUse={() => void useInChat([detail])}
          onLink={() => setLink(modelLink([detail.id]))}
          attaching={attaching}
        />
      )}
    </main>
  );
}

// Tool results render as inline cards. The explorer appears in fullscreen, when the
// user expands a card on a host without fullscreen, or when it was opened from the
// sidebar or thread panel rather than by a tool call.
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
  else if (!card)
    inline = (
      <section className="card" aria-busy="true">
        <p className="card-empty">Loading Phaseo data…</p>
      </section>
    );
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
