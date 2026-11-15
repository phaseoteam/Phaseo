"use client"

import * as React from "react"
import { CheckIcon, ChevronRightIcon, MinusIcon } from "lucide-react"

import { cn } from "./cn"

type TreeNode<T = unknown> = {
  id: string
  label: string
  children?: TreeNode<T>[]
  disabled?: boolean
  data?: T
}

type CheckState = "checked" | "unchecked" | "mixed"

type TreeRow<T> = {
  node: TreeNode<T>
  level: number
  parentId: string | null
  posInSet: number
  setSize: number
  /** Disabled itself or under a disabled branch. */
  disabled: boolean
}

type TreeItemState = {
  level: number
  expanded: boolean
  selected: boolean
  checked: CheckState | undefined
  isBranch: boolean
}

type TreeProps<T> = {
  items: TreeNode<T>[]
  "aria-label"?: string
  "aria-labelledby"?: string
  className?: string
  /** Expanded branch ids. Controlled when given. */
  expanded?: string[]
  defaultExpanded?: string[]
  onExpandedChange?: (expanded: string[]) => void
  /** "single" lets one row be selected with click, Enter or Space. "none" turns selection off. */
  selectionMode?: "single" | "none"
  selected?: string | null
  defaultSelected?: string | null
  onSelectedChange?: (id: string, node: TreeNode<T>) => void
  /** Adds a checkbox to every row. A branch is checked when all its leaves are, and mixed when some are. */
  checkable?: boolean
  /** Checked leaf ids. Controlled when given. */
  checked?: string[]
  defaultChecked?: string[]
  onCheckedChange?: (checked: string[]) => void
  /** Content after the label, such as a count or a timing. */
  renderMeta?: (node: TreeNode<T>, state: TreeItemState) => React.ReactNode
  /** Replaces the label. */
  renderLabel?: (node: TreeNode<T>, state: TreeItemState) => React.ReactNode
}

/* ---------- Pure helpers (exported for tests) ---------- */

/** The rows a reader can reach: every root, and the children of expanded branches, in order. */
function visibleRows<T>(
  items: TreeNode<T>[],
  expanded: ReadonlySet<string>,
  level = 1,
  parentId: string | null = null,
  out: TreeRow<T>[] = [],
  parentDisabled = false
): TreeRow<T>[] {
  items.forEach((node, index) => {
    const disabled = parentDisabled || Boolean(node.disabled)
    out.push({ node, level, parentId, posInSet: index + 1, setSize: items.length, disabled })
    if (node.children?.length && expanded.has(node.id)) {
      visibleRows(node.children, expanded, level + 1, node.id, out, disabled)
    }
  })
  return out
}

/** Every enabled leaf under a node, or the node itself when it is an enabled leaf. */
function leafIds<T>(node: TreeNode<T>): string[] {
  if (!node.children?.length) return node.disabled ? [] : [node.id]
  if (node.disabled) return []
  return node.children.flatMap(leafIds)
}

/**
 * A row's check state, over the same leaves that toggling it changes (its enabled leaves), so a branch whose
 * enabled leaves are all checked reads checked. A disabled row, or one with no enabled leaves, shows all of its leaves.
 */
function checkStateOf<T>(node: TreeNode<T>, checked: ReadonlySet<string>): CheckState {
  const enabled = leafIds(node)
  const leaves = enabled.length ? enabled : allLeafIds(node)
  const count = leaves.filter((id) => checked.has(id)).length
  if (count === 0) return "unchecked"
  return count === leaves.length ? "checked" : "mixed"
}

function allLeafIds<T>(node: TreeNode<T>): string[] {
  return node.children?.length ? node.children.flatMap(allLeafIds) : [node.id]
}

/** Toggles a row: a branch checks all of its enabled leaves unless they already are, then clears them. */
function toggleChecked<T>(node: TreeNode<T>, checked: readonly string[]): string[] {
  const set = new Set(checked)
  const targets = leafIds(node)
  if (targets.length === 0) return [...checked]
  const allOn = targets.every((id) => set.has(id))
  for (const id of targets) {
    if (allOn) set.delete(id)
    else set.add(id)
  }
  return [...set]
}

/** The ids from a root down to a node, or nothing when the node isn't in the tree. */
function pathTo<T>(items: TreeNode<T>[], id: string): string[] | undefined {
  for (const node of items) {
    if (node.id === id) return [node.id]
    const below = node.children && pathTo(node.children, id)
    if (below) return [node.id, ...below]
  }
  return undefined
}

function findNode<T>(items: TreeNode<T>[], id: string): TreeNode<T> | undefined {
  for (const node of items) {
    if (node.id === id) return node
    const found = node.children && findNode(node.children, id)
    if (found) return found
  }
  return undefined
}

/* ---------- Controlled / uncontrolled state ---------- */

function useControllable<V>(value: V | undefined, defaultValue: V, onChange?: (next: V) => void) {
  const [inner, setInner] = React.useState(defaultValue)
  const controlled = value !== undefined
  const current = controlled ? value : inner
  const set = React.useCallback(
    (next: V) => {
      if (!controlled) setInner(next)
      onChange?.(next)
    },
    [controlled, onChange]
  )
  return [current, set] as const
}

/* ---------- Component ---------- */

/**
 * A WAI-ARIA tree view. One Tab stop; arrow keys move between rows, Right and
 * Left open, close and move between parent and child, Home and End jump, `*`
 * opens every sibling, and typing a letter jumps to the next matching row.
 */
function Tree<T>({
  items,
  className,
  expanded: expandedProp,
  defaultExpanded = [],
  onExpandedChange,
  selectionMode = "single",
  selected: selectedProp,
  defaultSelected = null,
  onSelectedChange,
  checkable = false,
  checked: checkedProp,
  defaultChecked = [],
  onCheckedChange,
  renderMeta,
  renderLabel,
  ...aria
}: TreeProps<T>) {
  const [expandedList, setExpandedList] = useControllable(expandedProp, defaultExpanded, onExpandedChange)
  const [selected, setSelected] = useControllable<string | null>(selectedProp, defaultSelected)
  const [checkedList, setCheckedList] = useControllable(checkedProp, defaultChecked, onCheckedChange)

  const expanded = React.useMemo(() => new Set(expandedList), [expandedList])
  const checked = React.useMemo(() => new Set(checkedList), [checkedList])
  const rows = React.useMemo(() => visibleRows(items, expanded), [items, expanded])

  const [focusedId, setFocusedId] = React.useState<string | null>(null)
  // The row that holds the tab stop: the focused one, else the selected one, else the first.
  const tabStopId =
    (focusedId && rows.some((row) => row.node.id === focusedId) && focusedId) ||
    (selected && rows.some((row) => row.node.id === selected) && selected) ||
    rows[0]?.node.id ||
    null

  const itemRefs = React.useRef(new Map<string, HTMLLIElement>())
  const treeRef = React.useRef<HTMLUListElement>(null)
  // Whether focus was in the tree after the last commit, so a row that vanishes with focus can hand it on.
  const focusInside = React.useRef(false)
  const typeahead = React.useRef<{ text: string; timer: ReturnType<typeof setTimeout> | 0 }>({ text: "", timer: 0 })

  const focusRow = (id: string | undefined) => {
    if (!id) return
    setFocusedId(id)
    itemRefs.current.get(id)?.focus()
  }

  const setOpen = (id: string, open: boolean) => {
    if (expanded.has(id) === open) return
    setExpandedList(open ? [...expandedList, id] : expandedList.filter((value) => value !== id))
  }

  // When a collapse (often a controlled `expanded` change) removes the focused row, focus its nearest visible
  // ancestor, else the first row, so the arrow keys keep working. Only when focus was in the tree and is now lost.
  React.useLayoutEffect(() => {
    if (focusInside.current && focusedId && !rows.some((row) => row.node.id === focusedId)) {
      const active = document.activeElement
      if (!active || active === document.body || !active.isConnected) {
        const ancestors = pathTo(items, focusedId)?.slice(0, -1).reverse() ?? []
        const target = ancestors.find((id) => rows.some((row) => row.node.id === id)) ?? rows[0]?.node.id
        if (target) focusRow(target)
      }
    }
    focusInside.current = Boolean(treeRef.current?.contains(document.activeElement))
  })

  const select = (node: TreeNode<T>, disabled = Boolean(node.disabled)) => {
    if (selectionMode === "none" || disabled) return
    setSelected(node.id)
    onSelectedChange?.(node.id, node)
  }

  const toggleCheck = (node: TreeNode<T>, disabled = Boolean(node.disabled)) => {
    if (!checkable || disabled) return
    setCheckedList(toggleChecked(node, checkedList))
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    // Read the current row from the focused element, not state, so repeated keys in one tick still advance.
    const focusedItem = (event.target as HTMLElement).closest<HTMLElement>("[data-slot=tree-item]")
    const currentId = focusedItem?.dataset.treeId ?? tabStopId
    const index = rows.findIndex((row) => row.node.id === currentId)
    const row = rows[index]
    if (!row) return
    const { node } = row
    const isBranch = Boolean(node.children?.length)
    let handled = true

    switch (event.key) {
      case "ArrowDown":
        focusRow(rows[index + 1]?.node.id)
        break
      case "ArrowUp":
        focusRow(rows[index - 1]?.node.id)
        break
      case "Home":
        focusRow(rows[0]?.node.id)
        break
      case "End":
        focusRow(rows[rows.length - 1]?.node.id)
        break
      case "ArrowRight":
        if (isBranch && !expanded.has(node.id)) setOpen(node.id, true)
        else if (isBranch) focusRow(node.children?.[0]?.id)
        break
      case "ArrowLeft":
        if (isBranch && expanded.has(node.id)) setOpen(node.id, false)
        else if (row.parentId) focusRow(row.parentId)
        break
      case "Enter":
        if (selectionMode === "single") select(node, row.disabled)
        else if (checkable) toggleCheck(node, row.disabled)
        else if (isBranch) setOpen(node.id, !expanded.has(node.id))
        break
      case " ":
        if (checkable) toggleCheck(node, row.disabled)
        else select(node, row.disabled)
        break
      case "*": {
        const siblings = row.parentId ? findNode(items, row.parentId)?.children ?? [] : items
        const branches = siblings.filter((sibling) => sibling.children?.length).map((sibling) => sibling.id)
        setExpandedList([...new Set([...expandedList, ...branches])])
        break
      }
      default:
        handled = false
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const state = typeahead.current
          if (state.timer) clearTimeout(state.timer)
          state.text += event.key.toLowerCase()
          state.timer = setTimeout(() => {
            state.text = ""
            state.timer = 0
          }, 500)
          // Search from the next row, wrapping, so repeating a letter cycles through matches.
          const order = [...rows.slice(index + 1), ...rows.slice(0, index + 1)]
          const single = state.text.length > 1 && new Set(state.text).size === 1
          const match =
            order.find((candidate) => candidate.node.label.toLowerCase().startsWith(state.text)) ??
            (single ? order.find((candidate) => candidate.node.label.toLowerCase().startsWith(state.text[0])) : undefined)
          if (match) {
            focusRow(match.node.id)
            handled = true
          }
        }
    }

    if (handled) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const renderItems = (nodes: TreeNode<T>[], level: number, parentDisabled = false): React.ReactNode =>
    nodes.map((node, index) => {
      // A disabled branch disables everything under it.
      const disabled = parentDisabled || Boolean(node.disabled)
      const isBranch = Boolean(node.children?.length)
      const isOpen = isBranch && expanded.has(node.id)
      const checkState = checkable ? checkStateOf(node, checked) : undefined
      const state: TreeItemState = {
        level,
        expanded: isOpen,
        selected: selectionMode === "single" && selected === node.id,
        checked: checkState,
        isBranch,
      }
      return (
        <li
          key={node.id}
          ref={(element) => {
            if (element) itemRefs.current.set(node.id, element)
            else itemRefs.current.delete(node.id)
          }}
          role="treeitem"
          data-slot="tree-item"
          data-tree-id={node.id}
          aria-level={level}
          aria-setsize={nodes.length}
          aria-posinset={index + 1}
          aria-expanded={isBranch ? isOpen : undefined}
          aria-selected={selectionMode === "single" ? state.selected : undefined}
          aria-checked={checkState === undefined ? undefined : checkState === "mixed" ? "mixed" : checkState === "checked"}
          aria-disabled={disabled || undefined}
          tabIndex={tabStopId === node.id ? 0 : -1}
          onFocus={(event) => {
            if (event.target === event.currentTarget) setFocusedId(node.id)
          }}
          className="outline-none [&:focus-visible>[data-slot=tree-row]]:ring-3 [&:focus-visible>[data-slot=tree-row]]:ring-ring/30"
        >
          <div
            data-slot="tree-row"
            data-selected={state.selected || undefined}
            data-disabled={disabled || undefined}
            style={{ paddingInlineStart: `${0.5 + (level - 1) * 1.25}rem` }}
            className={cn(
              "flex min-h-8 cursor-default items-center gap-1.5 rounded-md pr-2 text-sm transition-colors select-none",
              "hover:bg-muted data-selected:bg-muted data-selected:font-medium data-selected:text-foreground",
              "data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:bg-transparent"
            )}
            onClick={(event) => {
              event.stopPropagation()
              focusRow(node.id)
              if (disabled) return
              if (checkable && selectionMode === "none") toggleCheck(node, disabled)
              else select(node, disabled)
            }}
          >
            {isBranch ? (
              <span
                data-slot="tree-indicator"
                aria-hidden="true"
                className="-m-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation()
                  focusRow(node.id)
                  setOpen(node.id, !isOpen)
                }}
              >
                <ChevronRightIcon
                  className={cn(
                    "size-4 transition-transform duration-150 ease-out motion-reduce:transition-none",
                    isOpen && "rotate-90"
                  )}
                />
              </span>
            ) : (
              <span aria-hidden="true" className="size-4 shrink-0" />
            )}
            {checkState !== undefined ? (
              <span
                data-slot="tree-checkbox"
                data-state={checkState}
                aria-hidden="true"
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-transparent bg-input/90 transition-shadow [&>svg]:size-3.5",
                  checkState !== "unchecked" && "border-primary bg-primary text-primary-foreground"
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  focusRow(node.id)
                  toggleCheck(node, disabled)
                }}
              >
                {checkState === "checked" ? <CheckIcon /> : checkState === "mixed" ? <MinusIcon /> : null}
              </span>
            ) : null}
            <span data-slot="tree-label" className="min-w-0 flex-1 truncate">
              {renderLabel ? renderLabel(node, state) : node.label}
            </span>
            {renderMeta ? (
              <span data-slot="tree-meta" className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {renderMeta(node, state)}
              </span>
            ) : null}
          </div>
          {isOpen ? (
            <ul role="group" data-slot="tree-group" className="flex flex-col gap-px pt-px">
              {renderItems(node.children ?? [], level + 1, disabled)}
            </ul>
          ) : null}
        </li>
      )
    })

  return (
    <ul
      ref={treeRef}
      role="tree"
      data-slot="tree"
      aria-multiselectable={checkable || undefined}
      {...aria}
      onKeyDown={onKeyDown}
      onFocus={() => {
        focusInside.current = true
      }}
      onBlur={() => {
        // After the browser has moved focus, so a row removed with focus still counts as inside.
        queueMicrotask(() => {
          focusInside.current = Boolean(treeRef.current?.contains(document.activeElement))
        })
      }}
      className={cn("flex w-full min-w-0 flex-col gap-px", className)}
    >
      {renderItems(items, 1)}
    </ul>
  )
}

export { Tree, visibleRows, leafIds, checkStateOf, toggleChecked }
export type { TreeNode, TreeProps, TreeItemState, CheckState }
