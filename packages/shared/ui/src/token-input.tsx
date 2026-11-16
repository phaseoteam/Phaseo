"use client"

import * as React from "react"
import { Node, mergeAttributes, type Editor } from "@tiptap/core"
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react"
import Document from "@tiptap/extension-document"
import Paragraph from "@tiptap/extension-paragraph"
import Text from "@tiptap/extension-text"
import HardBreak from "@tiptap/extension-hard-break"
import { Placeholder, UndoRedo } from "@tiptap/extensions"

import { cn } from "./cn"
import { InlineChip } from "./inline-chip"
import {
  contentToValue,
  filterSuggestions,
  findTrigger,
  normalizeValue,
  sameValue,
  valueToContent,
  type Token,
  type TokenInputValue,
  type TokenSuggestion,
  type TokenTrigger,
} from "./token-input-model"

type TokenInputProps = {
  value?: TokenInputValue
  defaultValue?: TokenInputValue
  onValueChange?: (value: TokenInputValue) => void
  /** Characters that open a suggestion menu and the tokens they insert. */
  triggers?: TokenTrigger[]
  placeholder?: string
  disabled?: boolean
  /** Marks the field invalid, like `aria-invalid` on `Textarea`. */
  invalid?: boolean
  /** Called on Enter (without Shift) when no menu is open. Without it, Enter starts a new line. */
  onSubmit?: (value: TokenInputValue) => void
  /** An icon shown before a token's label. */
  renderTokenIcon?: (token: Token) => React.ReactNode
  maxSuggestions?: number
  /** What screen readers hear when the menu opens; pass a translated message. */
  formatAnnouncement?: (count: number) => string
  className?: string
  id?: string
  /** Name the field with `aria-labelledby` pointing at a visible label, or `aria-label`. */
  "aria-label"?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
}

type OpenMenu = {
  trigger: TokenTrigger
  query: string
  from: number
  to: number
  items: TokenSuggestion[]
  top: number
  left: number
}

const defaultAnnouncement = (count: number) =>
  `${count} ${count === 1 ? "suggestion" : "suggestions"}. Up and Down to choose, Enter to insert.`

// A trigger must follow whitespace, so a line break reads as a newline; a token reads as one object character.
const leafText = (node: { type: { name: string } }) => (node.type.name === "hardBreak" ? "\n" : "￼")

const TokenIconContext = React.createContext<TokenInputProps["renderTokenIcon"]>(undefined)

function TokenChip({ node, selected }: NodeViewProps) {
  const renderIcon = React.useContext(TokenIconContext)
  const token = node.attrs as Token
  // The shared inline chip (the desktop composer's chip), so tokens look the same in every app.
  return (
    <NodeViewWrapper as="span" data-slot="token-input-token" data-token-type={token.type} className="inline">
      <InlineChip icon={renderIcon?.(token)} title={token.value} selected={selected}>
        {token.label}
        <span className="sr-only"> ({token.type})</span>
      </InlineChip>
    </NodeViewWrapper>
  )
}

/** An inline, atomic token. Backspace removes it whole. */
const TokenNode = Node.create({
  name: "token",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes: () => ({
    type: { default: "token", parseHTML: (element) => element.getAttribute("data-token-type"), renderHTML: (attrs) => ({ "data-token-type": attrs.type }) },
    value: { default: "", parseHTML: (element) => element.getAttribute("data-token-value"), renderHTML: (attrs) => ({ "data-token-value": attrs.value }) },
    label: { default: "", parseHTML: (element) => element.textContent, renderHTML: () => ({}) },
  }),
  parseHTML: () => [{ tag: "span[data-token]" }],
  renderHTML: ({ node, HTMLAttributes }) => ["span", mergeAttributes({ "data-token": "" }, HTMLAttributes), node.attrs.label],
  renderText: ({ node }) => node.attrs.label,
  addNodeView: () => ReactNodeViewRenderer(TokenChip),
})

function resolveItems(trigger: TokenTrigger, query: string, limit: number) {
  const items = typeof trigger.items === "function" ? trigger.items(query) : trigger.items
  return typeof trigger.items === "function" ? items.slice(0, limit) : filterSuggestions(items, query, limit)
}

/**
 * A text field with inline tokens. Typing a trigger character opens a list of
 * suggestions (arrow keys, Enter or Tab to insert, Escape to close). Tokens are
 * atomic: arrow keys step over them and Backspace removes the whole token.
 */
function TokenInput({
  value,
  defaultValue = [],
  onValueChange,
  triggers = [],
  placeholder,
  disabled = false,
  invalid = false,
  onSubmit,
  renderTokenIcon,
  maxSuggestions = 8,
  formatAnnouncement = defaultAnnouncement,
  className,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: TokenInputProps) {
  const reactId = React.useId()
  const listId = `${reactId}-suggestions`
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [menu, setMenu] = React.useState<OpenMenu | null>(null)
  const [active, setActive] = React.useState(0)
  // Bumped on every edit, so a controlled value that the parent didn't change is put back.
  const [edits, setEdits] = React.useState(0)
  const controlled = value !== undefined
  // Escape closes the menu until the query changes.
  const dismissed = React.useRef<string | null>(null)

  const latest = React.useRef({ triggers, onValueChange, onSubmit, maxSuggestions, menu, active, controlled })
  React.useLayoutEffect(() => {
    latest.current = { triggers, onValueChange, onSubmit, maxSuggestions, menu, active, controlled }
  })

  const updateMenu = React.useCallback((editor: Editor) => {
    const { state, view } = editor
    const { selection } = state
    const chars = latest.current.triggers.map((trigger) => trigger.char)
    if (!selection.empty || chars.length === 0 || !editor.isFocused) {
      setMenu(null)
      return
    }
    const { $from } = selection
    const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, leafText)
    const match = findTrigger(textBefore, chars)
    const trigger = match && latest.current.triggers.find((candidate) => candidate.char === match.char)
    if (!match || !trigger) {
      dismissed.current = null
      setMenu(null)
      return
    }
    const from = $from.pos - (textBefore.length - match.offset)
    const key = `${from}:${match.query}`
    if (dismissed.current === key) return
    dismissed.current = null
    const items = resolveItems(trigger, match.query, latest.current.maxSuggestions)
    if (items.length === 0) {
      setMenu(null)
      return
    }
    let top = 0
    let left = 0
    try {
      const coords = view.coordsAtPos(from)
      const box = containerRef.current?.getBoundingClientRect()
      if (box) {
        top = coords.bottom - box.top + 4
        left = Math.max(0, Math.min(coords.left - box.left, box.width - 224))
      }
    } catch {
      // Layout is unavailable (for example in tests); keep the menu at the field's corner.
    }
    const previous = latest.current.menu
    if (!previous || previous.from !== from || previous.query !== match.query) setActive(0)
    setMenu({ trigger, query: match.query, from, to: $from.pos, items, top, left })
  }, [])

  const insert = React.useCallback((editor: Editor, open: OpenMenu, suggestion: TokenSuggestion) => {
    editor
      .chain()
      .focus()
      .insertContentAt({ from: open.from, to: open.to }, [
        { type: "token", attrs: { type: open.trigger.type, value: suggestion.value, label: suggestion.label } },
        { type: "text", text: " " },
      ])
      .run()
    setMenu(null)
  }, [])

  const editorRef = React.useRef<Editor | null>(null)

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      UndoRedo,
      TokenNode,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: valueToContent(value ?? defaultValue),
    editorProps: {
      attributes: { role: "textbox", "aria-multiline": "true", spellcheck: "true" },
      handleKeyDown: (_view, event) => {
        const current = editorRef.current
        const { menu: open, active: activeIndex, onSubmit: submit } = latest.current
        if (current && open) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            const step = event.key === "ArrowDown" ? 1 : -1
            setActive((activeIndex + step + open.items.length) % open.items.length)
            return true
          }
          if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
            const suggestion = open.items[activeIndex]
            if (suggestion) insert(current, open, suggestion)
            return true
          }
          if (event.key === "Escape") {
            dismissed.current = `${open.from}:${open.query}`
            setMenu(null)
            return true
          }
        }
        if (current && submit && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          submit(contentToValue(current.getJSON()))
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: instance }) => {
      latest.current.onValueChange?.(contentToValue(instance.getJSON()))
      if (latest.current.controlled) setEdits((count) => count + 1)
      updateMenu(instance)
    },
    onSelectionUpdate: ({ editor: instance }) => updateMenu(instance),
    onFocus: ({ editor: instance }) => updateMenu(instance),
    onBlur: () => setMenu(null),
  })
  React.useLayoutEffect(() => {
    editorRef.current = editor
  }, [editor])

  // Keep the placeholder in step with the prop and redraw it.
  React.useEffect(() => {
    if (!editor) return
    const extension = editor.extensionManager.extensions.find((candidate) => candidate.name === "placeholder")
    if (!extension || extension.options.placeholder === (placeholder ?? "")) return
    extension.options.placeholder = placeholder ?? ""
    editor.view.dispatch(editor.state.tr)
  }, [editor, placeholder])

  // Follow a controlled value: after the parent changes it, and after an edit the parent didn't accept.
  React.useEffect(() => {
    if (!editor || value === undefined) return
    if (sameValue(normalizeValue(value), contentToValue(editor.getJSON()))) return
    editor.commands.setContent(valueToContent(value), { emitUpdate: false })
    // The text under the caret changed, so the menu may no longer match it.
    updateMenu(editor)
  }, [editor, value, edits, updateMenu])

  React.useEffect(() => {
    // Without emitting an update: only the editability changed, not the value.
    editor?.setEditable(!disabled, false)
  }, [editor, disabled])

  const activeId = menu ? `${listId}-${active}` : undefined

  // Name, describe and wire the editable element to the suggestion list.
  React.useEffect(() => {
    const dom = editor?.view.dom
    if (!dom) return
    const set = (name: string, attribute: string | undefined) => {
      if (attribute === undefined) dom.removeAttribute(name)
      else dom.setAttribute(name, attribute)
    }
    set("id", id)
    set("aria-label", ariaLabel)
    set("aria-labelledby", ariaLabelledBy)
    set("aria-describedby", ariaDescribedBy)
    set("aria-invalid", invalid ? "true" : undefined)
    set("aria-disabled", disabled ? "true" : undefined)
    set("aria-autocomplete", triggers.length ? "list" : undefined)
    set("aria-controls", menu ? listId : undefined)
    set("aria-activedescendant", activeId)
  }, [editor, id, ariaLabel, ariaLabelledBy, ariaDescribedBy, invalid, disabled, triggers.length, menu, listId, activeId])

  const announcement = menu ? formatAnnouncement(menu.items.length) : ""

  return (
    <TokenIconContext.Provider value={renderTokenIcon}>
      <div ref={containerRef} data-slot="token-input" data-disabled={disabled || undefined} className={cn("relative w-full min-w-0", className)}>
        <EditorContent
          editor={editor}
          onClick={(event) => {
            // Clicks on the padding around the text put the caret at the end.
            if (event.target === event.currentTarget) editor?.commands.focus("end")
          }}
          className={cn(
            "min-h-16 w-full cursor-text rounded-md border border-transparent bg-input/50 px-2.5 py-2 text-base transition-[color,box-shadow] duration-200 md:text-sm",
            "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
            invalid && "border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40",
            disabled && "cursor-not-allowed opacity-50",
            "[&_.ProseMirror]:min-h-11 [&_.ProseMirror]:break-words [&_.ProseMirror]:whitespace-pre-wrap [&_.ProseMirror]:outline-none",
            "[&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-muted-foreground [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]"
          )}
        />
        {menu ? (
          <div
            id={listId}
            role="listbox"
            data-slot="token-input-suggestions"
            aria-label={menu.trigger.label}
            style={{ top: menu.top, left: menu.left }}
            className="absolute z-50 max-h-72 w-max max-w-96 min-w-56 overflow-x-hidden overflow-y-auto rounded-md bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10"
          >
            {menu.items.map((suggestion, index) => (
              <div
                key={suggestion.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                data-selected={index === active || undefined}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => editor && insert(editor, menu, suggestion)}
                className="flex min-h-7 cursor-default items-center gap-4 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-selected:bg-muted data-selected:text-foreground"
              >
                <span className="shrink-0">{suggestion.label}</span>
                {suggestion.description ? (
                  <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">{suggestion.description}</span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <span aria-live="polite" className="sr-only">
          {announcement}
        </span>
      </div>
    </TokenIconContext.Provider>
  )
}

export { TokenInput }
export type { TokenInputProps }
export {
  tokenInputText,
  type Token,
  type TokenInputValue,
  type TokenSuggestion,
  type TokenTrigger,
} from "./token-input-model"
