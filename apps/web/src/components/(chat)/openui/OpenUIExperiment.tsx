"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ChatAnswerContent } from "./ChatAnswerContent";
import {
  OPENUI_BROKEN_FIXTURE,
  OPENUI_EDGE_FIXTURE,
  OPENUI_FIXTURE,
} from "./openuiFixtures";

const examples = [
  { label: "comparison", content: OPENUI_FIXTURE, interactive: true },
  { label: "edge", content: OPENUI_EDGE_FIXTURE, interactive: true },
  { label: "malformed", content: OPENUI_BROKEN_FIXTURE, interactive: true },
  {
    label: "markdown",
    content:
      "## Ordinary answer\n\nMarkdown still works. **No interactive components needed.**",
    interactive: true,
  },
] as const;
const STORAGE_KEY = "phaseo-openui-experiment-fixtures-v1";

export function OpenUIExperiment() {
  const t = useTranslations("Common.ui.openui");
  const [index, setIndex] = useState(0);
  const [states, setStates] = useState<Record<string, Record<string, unknown>>>(
    () => {
      if (typeof window === "undefined") return {};
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      } catch {
        return {};
      }
    },
  );
  const [streamed, setStreamed] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState("");
  const [storageError, setStorageError] = useState(false);
  const example = examples[index];
  const isStreaming =
    streamed !== null && streamed.length < example.content.length;
  useEffect(() => {
    if (!isStreaming) return;
    const timer = window.setTimeout(
      () =>
        setStreamed((value) =>
          example.content.slice(0, (value?.length ?? 0) + 24),
        ),
      30,
    );
    return () => window.clearTimeout(timer);
  }, [streamed, isStreaming, example.content]);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header>
        <p className="mb-2 text-xs text-muted-foreground">
          {t("localLabel")}
        </p>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("description")}
        </p>
      </header>
      <nav aria-label={t("examples")} className="flex flex-wrap gap-2">
        {examples.map((item, i) => (
          <Button
            key={item.label}
            variant={index === i ? "default" : "outline"}
            size="sm"
            aria-pressed={index === i}
            onClick={() => {
              setIndex(i);
              setStreamed(null);
              setSubmitted("");
            }}
          >
            {t(item.label)}
          </Button>
        ))}
      </nav>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={isStreaming}
          onClick={() => setStreamed("")}
        >
          {t("replay")}
        </Button>
        {isStreaming && (
          <Button size="sm" variant="outline" onClick={() => setStreamed(null)}>
            {t("stop")}
          </Button>
        )}
      </div>
      <ChatAnswerContent
        key={`${index}:${streamed === null ? "full" : "replay"}`}
        content={streamed ?? example.content}
        interactive={example.interactive}
        isStreaming={isStreaming}
        disabled={false}
        initialState={states[index]}
        onStateChange={(state) => {
          const next = { ...states, [index]: state };
          setStates(next);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            setStorageError(true);
          }
        }}
        onSubmit={(prompt) => { setSubmitted(prompt); return true; }}
      />
      {storageError && (
        <p role="status" className="text-sm text-destructive">
          {t("storage")}
        </p>
      )}
      {submitted && (
        <section aria-live="polite" className="rounded-lg border p-4">
          <h2 className="mb-2 text-sm font-medium">{t("submitted")}</h2>
          <p className="whitespace-pre-wrap text-sm">{submitted}</p>
        </section>
      )}
    </main>
  );
}
