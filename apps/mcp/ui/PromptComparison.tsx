import { useState } from "react";
import type { Model } from "./model";
import type { CallTool } from "./workflows";

type Plan = {
  modelId: string;
  modelName: string;
  providerId: string;
  estimatedCostUsd: number;
};
type Quote = {
  quoteToken: string;
  expiresAt: number;
  estimatedCostUsd: number;
  maxOutputTokens: number;
  plans: Plan[];
  inferenceAllowed: boolean;
};
type RunResult = Plan & {
  text: string | null;
  requestId: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  finishReason: string | null;
  error: string | null;
};

export function PromptComparison({
  models,
  callTool,
  onBusyChange,
}: {
  models: Model[];
  callTool: CallTool;
  onBusyChange: (busy: boolean) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState("512");
  const [budget, setBudget] = useState("0.10");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [results, setResults] = useState<RunResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function invalidate() {
    setQuote(null);
    setResults([]);
    setError("");
  }
  async function estimate() {
    onBusyChange(true);
    setBusy(true);
    setError("");
    setQuote(null);
    setResults([]);
    try {
      const result = await callTool("inference_quote", {
        modelIds: models.map((model) => model.id),
        prompt,
        maxOutputTokens: Number(maxOutputTokens),
        maxEstimatedCostUsd: Number(budget),
      });
      setQuote(result as unknown as Quote);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not estimate the run.",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  async function run() {
    if (!quote || quote.expiresAt <= Date.now()) {
      setQuote(null);
      setError("Estimate expired. Review a new estimate.");
      return;
    }
    setBusy(true);
    setError("");
    onBusyChange(true);
    const reviewed = quote;
    setQuote(null); // An uncertain submission must never be retried automatically.
    try {
      const result = await callTool("inference_run", {
        quoteToken: reviewed.quoteToken,
        prompt,
      });
      setResults(result.results as RunResult[]);
    } catch (reason) {
      setError(
        `${reason instanceof Error ? reason.message : "Submission failed."} Check request history before starting another run.`,
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <section className="workflow-panel">
      <h2>Try your prompt</h2>
      <p className="note">
        Runs plain text through {models.map((model) => model.name).join(", ")}.
        Your prompt is sent to Phaseo and the listed providers. Charges use your
        workspace credits.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void estimate();
        }}
      >
        <label className="prompt-field">
          Prompt
          <textarea
            required
            maxLength={8000}
            rows={5}
            value={prompt}
            disabled={busy}
            onChange={(event) => {
              setPrompt(event.target.value);
              invalidate();
            }}
          />
        </label>
        <label>
          Max output tokens per model
          <input
            type="number"
            min={1}
            max={2048}
            step={1}
            required
            value={maxOutputTokens}
            disabled={busy}
            onChange={(event) => {
              setMaxOutputTokens(event.target.value);
              invalidate();
            }}
          />
        </label>
        <label>
          Estimate budget (USD)
          <input
            type="number"
            min={0.000001}
            max={1}
            step="any"
            required
            value={budget}
            disabled={busy}
            onChange={(event) => {
              setBudget(event.target.value);
              invalidate();
            }}
          />
        </label>
        <button disabled={busy || !models.length}>
          {busy ? "Working…" : "Review estimate"}
        </button>
      </form>
      <p className="note">
        Estimate budget filters runs by listed token pricing; it is not a
        guaranteed billing cap. Output limits and your Gateway spending rules
        apply. No automatic retries.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {quote && (
        <div className="run-review">
          <h3>Review your run</h3>
          <ul>
            {quote.plans.map((plan) => (
              <li key={plan.modelId}>
                {plan.modelName} · {plan.providerId} · estimated $
                {plan.estimatedCostUsd.toFixed(6)}
              </li>
            ))}
          </ul>
          <p>
            Estimated total:{" "}
            <strong>${quote.estimatedCostUsd.toFixed(6)} USD</strong> · up to{" "}
            {quote.maxOutputTokens} output tokens per model.
          </p>
          <p className="note">
            Estimate expires at {new Date(quote.expiresAt).toLocaleTimeString()}
            . Uses prompt bytes plus a framing allowance, not an exact
            tokenizer.
          </p>
          {!quote.inferenceAllowed && (
            <p className="note">
              Inference needs gateway:access consent. Your host may request it
              when you run; otherwise reconnect Phaseo with inference access.
            </p>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() => void run()}
          >
            Run comparison · spends credits
          </button>
        </div>
      )}
      {!!results.length && (
        <div className="run-results" aria-live="polite">
          {results.map((result) => (
            <article key={result.modelId}>
              <h3>{result.modelName}</h3>
              <p className="note">
                {result.providerId} · estimate $
                {result.estimatedCostUsd.toFixed(6)}
              </p>
              {result.error ? (
                <p role="alert" className="error">
                  {result.error}
                </p>
              ) : (
                <>
                  <pre tabIndex={0}>{result.text}</pre>
                  <p className="note">
                    {result.latencyMs} ms · {result.inputTokens ?? "?"} input /{" "}
                    {result.outputTokens ?? "?"} output tokens ·{" "}
                    {result.finishReason ?? "Unknown finish reason"}
                  </p>
                  <code>{result.requestId}</code>
                </>
              )}
            </article>
          ))}
          <p className="note">
            Model outputs may be incorrect. Final charges and uncertain
            submissions can be checked in request history.
          </p>
        </div>
      )}
    </section>
  );
}
