import { App } from "@modelcontextprotocol/ext-apps";
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { contextSize, pricePerMillion, type Model } from "./model";
import { ModelComparison } from "./ModelComparison";
import { ModelDetails } from "./ModelDetails";
import logoSvg from "../plugin/phaseo/assets/logo_light.svg";

const bridge = new App(
  { name: "Phaseo model explorer", version: "0.1.0" },
  { availableDisplayModes: ["fullscreen"] },
);
type Result = {
  isError?: boolean;
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
};

function readResult(result: Result) {
  if (result.isError)
    throw new Error(
      result.content?.find((item) => item.type === "text")?.text ??
        "Phaseo could not load this data.",
    );
  if (!result.structuredContent || typeof result.structuredContent !== "object")
    throw new Error("Phaseo returned an incomplete result. Try again.");
  return result.structuredContent as Record<string, unknown>;
}

function Explorer() {
  const [models, setModels] = useState<Model[]>([]);
  const [query, setQuery] = useState("");
  const [modality, setModality] = useState("");
  const [provider, setProvider] = useState("");
  const [selected, setSelected] = useState<Model[]>([]);
  const [detail, setDetail] = useState<Model | null>(null);
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [estimates, setEstimates] = useState<Record<string, string>>({});
  const [inputTokens, setInputTokens] = useState("1000");
  const [outputTokens, setOutputTokens] = useState("1000");
  const [estimating, setEstimating] = useState(false);
  const request = useRef(0);
  const detailRequest = useRef(0);

  useEffect(() => {
    bridge.ontoolresult = (result) => {
      try {
        const data = readResult(result);
        if (Array.isArray(data.models)) setModels(data.models as Model[]);
        setBusy(false);
      } catch (reason) {
        setError(String(reason));
        setBusy(false);
      }
    };
    bridge.onhostcontextchanged = (context) => {
      if (context.theme) document.documentElement.dataset.theme = context.theme;
    };
    void bridge
      .connect()
      .then(async () => {
        setConnected(true);
        const context = bridge.getHostContext();
        if (context?.theme)
          document.documentElement.dataset.theme = context.theme;
        if (
          context?.displayMode !== "fullscreen" &&
          context?.availableDisplayModes?.includes("fullscreen")
        ) {
          await bridge.requestDisplayMode({ mode: "fullscreen" });
        }
      })
      .catch(() => {
        setBusy(false);
        setError(
          "Open the model explorer from the connected Phaseo plugin to load live data.",
        );
      });
  }, []);

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
          },
        }),
      );
      if (!Array.isArray(data.models))
        throw new Error("Phaseo returned an incomplete model list. Try again.");
      if (sequence === request.current) setModels(data.models as Model[]);
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
            `$${result.totalCostUSD.toFixed(6)}${result.providerId ? ` · ${result.providerId}` : ""}`,
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
    <main>
      <header>
        <span className="brand">
          <span
            className="brand-icon"
            aria-hidden="true"
            dangerouslySetInnerHTML={{
              __html: logoSvg.replace('fill="black"', 'fill="currentColor"'),
            }}
          />
          Phaseo
        </span>
        <span className="live">Live catalogue</span>
      </header>
      <div className="heading">
        <div>
          <p className="eyebrow">MODEL EXPLORER</p>
          <h1>{compare ? "Compare your shortlist" : "Find your next model"}</h1>
        </div>
        {compare && (
          <button onClick={() => setCompare(false)}>Back to models</button>
        )}
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {!compare ? (
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
              <select
                value={modality}
                onChange={(event) => setModality(event.target.value)}
              >
                <option value="">Any input</option>
                {["text", "image", "audio", "video"].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" disabled={!connected || busy}>
              {busy ? "Searching…" : "Search"}
            </button>
          </form>
          <div className="list-heading">
            <span role="status">
              {busy
                ? "Loading models…"
                : `${models.length} results · up to 20 per search`}
            </span>
            <span>Lowest paid USD / 1M tokens</span>
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
                <article key={model.id} className="model-row">
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
                  <button
                    className="model-name"
                    onClick={() => void openDetail(model)}
                  >
                    <strong>{model.name}</strong>
                    <span>
                      {model.provider ?? "Unknown provider"} ·{" "}
                      {contextSize(model.contextTokens)} context
                    </span>
                  </button>
                  <div className="rates">
                    <span>
                      {pricePerMillion(model.inputPricePerToken)}{" "}
                      <small>in</small>
                    </span>
                    <span>
                      {pricePerMillion(model.outputPricePerToken)}{" "}
                      <small>out</small>
                    </span>
                  </div>
                  <span className="capability">
                    {model.hasFreeProvider ? "Free offer · " : ""}
                    {model.supportsTools
                      ? "Tools"
                      : model.inputModalities.join(" / ")}
                  </span>
                </article>
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
          </footer>
        </>
      ) : (
        <>
          <ModelComparison models={selected} />
          <section className="calculator">
            <p className="eyebrow">WORKLOAD ESTIMATE</p>
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
        />
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Explorer />);
