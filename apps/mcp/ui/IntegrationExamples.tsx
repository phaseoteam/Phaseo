import { useState } from "react";
import type { Model } from "./model";
import { integrationExample } from "./workflows";
import { SelectField } from "./Select";

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
    <section className="workflow-panel">
      <h3>Integrate this model</h3>
      <label>
        Language
        <SelectField
          label="Language"
          value={language}
          onValueChange={setLanguage}
          options={["TypeScript", "Python", "curl"].map((value) => ({
            value,
            label: value,
          }))}
        />
      </label>
      <p className="note">
        Set PHASEO_API_KEY in your environment.{" "}
        {language === "TypeScript"
          ? "Install the openai npm package."
          : language === "Python"
            ? "Install the openai Python package."
            : "Example uses a POSIX shell."}{" "}
        This example makes a billable request when run.
      </p>
      <pre tabIndex={0}>
        <code>{integrationExample(model, language)}</code>
      </pre>
    </section>
  );
}
