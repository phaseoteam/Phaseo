"use client";

import { createContext, useContext, useId, useRef, useState } from "react";
import {
  createLibrary,
  defineComponent,
  useIsStreaming,
  useRenderNode,
  useStateField,
  type ElementNode,
  type ParseResult,
} from "@openuidev/react-lang";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { openUIFollowUp } from "./openuiHelpers";

export const OpenUIActionContext = createContext<{
  disabled: boolean;
  onSubmit?: (prompt: string) => boolean | Promise<boolean>;
}>({ disabled: true });
const text = z.string().max(8000);
const label = z.string().max(300);
const tableSchema = z.object({
  title: label,
  columns: z.array(label).min(1).max(8),
  rows: z.array(z.array(label).max(8)).max(50),
});
const chartSchema = z.object({
  title: label,
  unit: label,
  items: z
    .array(z.object({ label, value: z.number().finite() }))
    .min(1)
    .max(20),
});
const comparisonSchema = z.object({
  title: label,
  options: z
    .array(
      z.object({
        name: label,
        description: text,
        benefits: z.array(label).max(6),
        tradeoffs: z.array(label).max(6),
      }),
    )
    .min(2)
    .max(4),
});
const followUpSchema = z.object({
  question: label,
  fieldName: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/),
  placeholder: label,
  buttonLabel: label,
});

const Paragraph = defineComponent({
  name: "Paragraph",
  description: "Plain text explanation; never raw HTML.",
  props: z.object({ text }),
  component: ({ props }) =>
    typeof props.text === "string" ? (
      <p className="whitespace-pre-wrap text-sm leading-6">
        {props.text.slice(0, 8000)}
      </p>
    ) : null,
});

const DataTable = defineComponent({
  name: "DataTable",
  description:
    "A comparison or data table with column headers and string cells.",
  props: tableSchema,
  component: ({ props }) => {
    const data = tableSchema.safeParse(props);
    if (!data.success) return null;
    const { title, columns, rows } = data.data;
    return (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <caption className="p-3 text-left font-medium">{title}</caption>
          <thead className="bg-muted">
            <tr>
              {columns.map((column, i) => (
                <th key={i} scope="col" className="px-3 py-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t">
                {columns.map((_, j) => (
                  <td key={j} className="px-3 py-2 align-top">
                    {row[j] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
});

const BarChart = defineComponent({
  name: "BarChart",
  description:
    "A horizontal bar chart for numeric comparisons, including negative and zero values. Always name the unit.",
  props: chartSchema,
  component: ({ props }) => {
    const data = chartSchema.safeParse(props);
    if (!data.success) return null;
    const { title, unit, items } = data.data;
    const maximum = Math.max(1, ...items.map((item) => Math.abs(item.value)));
    return (
      <figure className="rounded-lg border p-4">
        <figcaption className="mb-4 font-medium">
          {title}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({unit})
          </span>
        </figcaption>
        <ul className="space-y-3">
          {items.map((item, i) => (
            <li key={i}>
              <div className="mb-1 flex justify-between gap-3 text-sm">
                <span>{item.label}</span>
                <span className="tabular-nums">
                  {item.value.toLocaleString()} {unit}
                </span>
              </div>
              <div className="h-2 rounded bg-muted" aria-hidden="true">
                <div
                  className={`h-2 rounded ${item.value < 0 ? "bg-destructive" : "bg-primary"}`}
                  style={{
                    width: `${(Math.abs(item.value) / maximum) * 100}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </figure>
    );
  },
});

const Comparison = defineComponent({
  name: "Comparison",
  description:
    "Two to four options displayed side by side; use factual descriptions, benefits, and tradeoffs.",
  props: comparisonSchema,
  component: ({ props }) => {
    const data = comparisonSchema.safeParse(props);
    if (!data.success) return null;
    return (
      <section>
        <h3 className="mb-3 font-medium">{data.data.title}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.data.options.map((option, i) => (
            <article key={i} className="rounded-lg border p-4">
              <h4 className="font-medium">{option.name}</h4>
              <p className="my-2 text-sm text-muted-foreground">
                {option.description}
              </p>
              <ul className="space-y-1 text-sm">
                {option.benefits.map((benefit, j) => (
                  <li key={j}>+ {benefit}</li>
                ))}
              </ul>
              {option.tradeoffs.length > 0 && (
                <>
                  <p className="mb-1 mt-3 text-xs font-medium text-muted-foreground">
                    Tradeoffs
                  </p>
                  <ul className="space-y-1 text-sm">
                    {option.tradeoffs.map((tradeoff, j) => (
                      <li key={j}>{tradeoff}</li>
                    ))}
                  </ul>
                </>
              )}
            </article>
          ))}
        </div>
      </section>
    );
  },
});

export function FollowUpForm({
  question,
  fieldName,
  placeholder,
  buttonLabel,
}: {
  question: string;
  fieldName: string;
  placeholder: string;
  buttonLabel: string;
}) {
  const field = useStateField<string>(fieldName, "");
  const streaming = useIsStreaming();
  const actions = useContext(OpenUIActionContext);
  const pending = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const id = useId();
  const value = typeof field.value === "string" ? field.value : "";
  return (
    <form
      className="space-y-3 rounded-lg border bg-muted/30 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const prompt = openUIFollowUp(question, value);
        if (!prompt || streaming || actions.disabled || pending.current || !actions.onSubmit) return;
        pending.current = true;
        setSubmitted(true);
        let accepted = false;
        try {
          accepted = await actions.onSubmit(prompt);
        } catch {
          // The normal chat flow reports request failures; allow a rejected send to retry.
        } finally {
          if (!accepted) {
            pending.current = false;
            setSubmitted(false);
          }
        }
      }}
    >
      <label htmlFor={id} className="block text-sm font-medium">
        {question}
      </label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        maxLength={2000}
        disabled={streaming || actions.disabled || submitted}
        onChange={(event) => field.setValue(event.target.value)}
      />
      <Button
        type="submit"
        size="sm"
        disabled={streaming || actions.disabled || submitted || !value.trim()}
      >
        {buttonLabel}
      </Button>
    </form>
  );
}

const FollowUp = defineComponent({
  name: "FollowUp",
  description:
    "One editable text field whose submit sends the question and answer back to the assistant. Use a unique short fieldName.",
  props: followUpSchema,
  component: ({ props }) => {
    const data = followUpSchema.safeParse(props);
    return data.success ? <FollowUpForm {...data.data} /> : null;
  },
});

const Answer = defineComponent({
  name: "Answer",
  description: "The response root, with a title and ordered content blocks.",
  props: z.object({
    title: label,
    children: z
      .array(
        z.union([
          Paragraph.ref,
          DataTable.ref,
          BarChart.ref,
          Comparison.ref,
          FollowUp.ref,
        ]),
      )
      .max(20),
  }),
  component: function AnswerComponent({ props }) {
    const render = useRenderNode();
    return (
      <section className="space-y-4 text-foreground">
        <h2 className="text-lg font-semibold">
          {typeof props.title === "string" ? props.title.slice(0, 300) : ""}
        </h2>
        {Array.isArray(props.children)
          ? props.children
              .slice(0, 20)
              .map((child, i) => <div key={i}>{render(child)}</div>)
          : null}
      </section>
    );
  },
});

export const openuiLibrary = createLibrary({
  root: "Answer",
  components: [Answer, Paragraph, DataTable, BarChart, Comparison, FollowUp],
});

export function isValidOpenUIResult(result: ParseResult | null): boolean {
  if (
    !result?.root ||
    result.meta.incomplete ||
    result.meta.unresolved.length ||
    result.queryStatements.length ||
    result.mutationStatements.length
  )
    return false;
  const validNode = (node: ElementNode) => {
    if (
      node.type !== "element" ||
      ![
        "Paragraph",
        "DataTable",
        "BarChart",
        "Comparison",
        "FollowUp",
      ].includes(node.typeName)
    )
      return false;
    const component = openuiLibrary.components[node.typeName];
    return Boolean(component?.props.safeParse(node.props).success);
  };
  // Component refs describe child props; parsed children are ElementNode wrappers.
  return (
    result.root.typeName === "Answer" &&
    label.safeParse(result.root.props.title).success &&
    Array.isArray(result.root.props.children) &&
    result.root.props.children.length <= 20 &&
    result.root.props.children.every(
      (child: ElementNode) => child && validNode(child),
    )
  );
}

export function getOpenUIPrompt() {
  return openuiLibrary.prompt({
    preamble:
      "You are a helpful assistant. Use interactive OpenUI answers when they help the user compare, explore, or provide information. Ordinary Markdown is allowed for simple questions and code.",
    additionalRules: [
      "For answers benefiting from a table, chart, comparison, or follow-up form, emit only OpenUI Lang, starting with root = Answer(...). Do not use code fences or mix Markdown with OpenUI Lang.",
      "For simple questions or code, ordinary Markdown is allowed. Never invent data; label illustrative figures clearly. Do not use Query, Mutation, external tools, URLs, HTML, or executable code in OpenUI output.",
      "Use only the registered components, at most 20 blocks. FollowUp submits a normal user message; do not include action expressions.",
    ],
  });
}
