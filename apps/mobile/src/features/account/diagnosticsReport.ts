import type { SlowOperation } from "@/lib/diagnostics";

export type DiagnosticsSection = { title: string; rows: [label: string, value: string][] };

const clock = (ms: number) => new Date(ms).toISOString().slice(11, 19);

/** One line per slow operation: "12:04:31  Chat opened  182 ms  (1,204 messages)". */
export function slowOperationLine(operation: SlowOperation) {
  return `${clock(operation.at)}  ${operation.name}  ${Math.round(operation.ms)} ms${operation.detail ? `  (${operation.detail})` : ""}`;
}

/** Diagnostics as plain text, for copying or sharing. Built only from what the screen shows; no account details. */
export function diagnosticsText(sections: DiagnosticsSection[], slow: SlowOperation[], generatedAt: number, threshold: number) {
  const lines = [`Phaseo diagnostics, ${new Date(generatedAt).toISOString()}`];
  for (const section of sections) {
    lines.push("", section.title);
    for (const [label, value] of section.rows) lines.push(`  ${label}: ${value}`);
  }
  lines.push("", `Slow operations (${threshold} ms or more, newest first, times in UTC)`);
  if (!slow.length) lines.push("  None recorded");
  for (const operation of slow) lines.push(`  ${slowOperationLine(operation)}`);
  return `${lines.join("\n")}\n`;
}
