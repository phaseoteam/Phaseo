import { useState } from "react";
import type { Model } from "./model";
import { integrationExample } from "./workflows";

const LANGUAGES = ["TypeScript", "Python", "curl"];

export function IntegrationExamples({ model }: { model: Model }) {
  const [language, setLanguage] = useState("TypeScript");
  if (
    !model.inputModalities.includes("text") ||
    !model.outputModalities.includes("text") ||
    !model.gatewayAvailable ||
    !model.supportedEndpoints?.some((endpoint) =>
      ["chat.completions", "text.generate"].includes(endpoint),
    )
  )
    return (
      <p className="note">
        Examples are available for models with Gateway text chat support.
      </p>
    );
  return (
    <section className="section">
      <h2>Use this model</h2>
      <div className="segmented" role="group" aria-label="Language">
        {LANGUAGES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={language === value}
            onClick={() => setLanguage(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <pre tabIndex={0} className="code">
        <code>{integrationExample(model, language)}</code>
      </pre>
      <p className="note">
        Set PHASEO_API_KEY in your environment.{" "}
        {language === "TypeScript"
          ? "Install the openai npm package."
          : language === "Python"
            ? "Install the openai Python package."
            : "Example uses a POSIX shell."}{" "}
        Running it makes a billable request.
      </p>
    </section>
  );
}
