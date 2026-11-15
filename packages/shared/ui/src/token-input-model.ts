import type { JSONContent } from "@tiptap/core"

/** An inline token such as a model, file or preset. */
export type Token = { type: string; value: string; label: string }

/** Text with tokens in it. Strings may contain "\n" for line breaks. */
export type TokenInputValue = Array<string | Token>

export type TokenSuggestion = {
  value: string
  label: string
  /** Secondary text shown on the right, such as an id. */
  description?: string
  /** Extra words that match the query. */
  keywords?: string[]
}

export type TokenTrigger = {
  /** The character that opens the menu, such as "@" or "/". */
  char: string
  /** The token type inserted from this menu. */
  type: string
  items: TokenSuggestion[] | ((query: string) => TokenSuggestion[])
  /** Accessible name for the suggestion list, such as "Models". */
  label?: string
}

export type TriggerMatch = { char: string; query: string; offset: number }

const MAX_QUERY = 48

/**
 * Finds an open trigger in the text before the caret: a trigger character at
 * the start or after whitespace, followed by a query with no whitespace.
 */
export function findTrigger(textBefore: string, chars: readonly string[]): TriggerMatch | null {
  for (let index = textBefore.length - 1; index >= 0 && textBefore.length - index <= MAX_QUERY + 1; index--) {
    const character = textBefore[index]
    if (/\s/.test(character)) return null
    if (chars.includes(character) && (index === 0 || /\s/.test(textBefore[index - 1]))) {
      return { char: character, query: textBefore.slice(index + 1), offset: index }
    }
  }
  return null
}

/** Ranks label prefix matches first, then word starts, then any match in label, value or keywords. */
export function filterSuggestions(items: readonly TokenSuggestion[], query: string, limit = 8): TokenSuggestion[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return items.slice(0, limit)
  const scored: Array<{ item: TokenSuggestion; score: number; index: number }> = []
  items.forEach((item, index) => {
    const label = item.label.toLowerCase()
    let score = -1
    if (label.startsWith(needle)) score = 0
    else if (label.split(/[\s\-_/.]+/).some((word) => word.startsWith(needle))) score = 1
    else if ([label, item.value.toLowerCase(), ...(item.keywords ?? []).map((word) => word.toLowerCase())].some((text) => text.includes(needle))) score = 2
    if (score >= 0) scored.push({ item, score, index })
  })
  return scored
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item)
}

export function isToken(segment: string | Token): segment is Token {
  return typeof segment !== "string"
}

/** Editor content for a value: one paragraph, with hard breaks for "\n". */
export function valueToContent(value: TokenInputValue): JSONContent {
  const content: JSONContent[] = []
  for (const segment of value) {
    if (isToken(segment)) {
      content.push({ type: "token", attrs: { type: segment.type, value: segment.value, label: segment.label } })
      continue
    }
    segment.split("\n").forEach((line, index) => {
      if (index > 0) content.push({ type: "hardBreak" })
      if (line) content.push({ type: "text", text: line })
    })
  }
  return { type: "doc", content: [{ type: "paragraph", content }] }
}

/** The value of editor content. Paragraphs and hard breaks become "\n"; adjacent text is merged. */
export function contentToValue(doc: JSONContent): TokenInputValue {
  const out: TokenInputValue = []
  const pushText = (text: string) => {
    if (!text) return
    const last = out[out.length - 1]
    if (typeof last === "string") out[out.length - 1] = last + text
    else out.push(text)
  }
  ;(doc.content ?? []).forEach((block, blockIndex) => {
    if (blockIndex > 0) pushText("\n")
    for (const node of block.content ?? []) {
      if (node.type === "text") pushText(node.text ?? "")
      else if (node.type === "hardBreak") pushText("\n")
      else if (node.type === "token") {
        const attrs = (node.attrs ?? {}) as Partial<Token>
        out.push({ type: String(attrs.type ?? "token"), value: String(attrs.value ?? ""), label: String(attrs.label ?? "") })
      }
    }
  })
  return out
}

/** Plain text of a value, with each token written as its label. */
export function tokenInputText(value: TokenInputValue): string {
  return value.map((segment) => (isToken(segment) ? segment.label : segment)).join("")
}

export function sameValue(a: TokenInputValue, b: TokenInputValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
