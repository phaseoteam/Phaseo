import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "@/i18n/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  MODEL_LINK_KINDS,
  defaultModelLinkTitle,
  detectModelLinkKind,
  normaliseModelLinkKind,
  suggestModelLinkTitle,
  type ModelLinkKind,
} from "@/lib/models/modelLinks"

export interface ModelLinkDraft {
  id: string
  kind: ModelLinkKind
  title: string
  url: string
  /** Set once someone picks a kind, so pasting a URL no longer changes it. */
  kindEdited: boolean
  /** Set once someone types a title, so pasting a URL no longer replaces it. */
  titleEdited: boolean
}

export interface ModelLinkPayload {
  kind: ModelLinkKind
  platform: ModelLinkKind
  title: string
  url: string
}

type ModelLinkRow = {
  link_kind?: string | null
  kind?: string | null
  platform?: string | null
  title?: string | null
  url?: string | null
}

let draftCounter = 0
function nextDraftId() {
  draftCounter += 1
  return `link-${draftCounter}`
}

/** Builds editor rows from stored links, keeping their saved order. */
export function modelLinkDraftsFromRows(rows: ModelLinkRow[] | null | undefined): ModelLinkDraft[] {
  return (rows ?? []).flatMap((row) => {
    const url = row.url?.trim() ?? ""
    if (!url) return []
    const kind = normaliseModelLinkKind(row.link_kind ?? row.kind ?? row.platform, url)
    return [{
      id: nextDraftId(),
      kind,
      title: row.title?.trim() || defaultModelLinkTitle(kind),
      url,
      kindEdited: true,
      titleEdited: true,
    }]
  })
}

/** The rows to save, in list order. Rows without a URL are dropped. */
export function modelLinkPayloadFromDrafts(drafts: ModelLinkDraft[]): ModelLinkPayload[] {
  return drafts.flatMap((draft) => {
    const url = draft.url.trim()
    if (!url) return []
    return [{
      kind: draft.kind,
      platform: draft.kind,
      title: draft.title.trim() || defaultModelLinkTitle(draft.kind),
      url,
    }]
  })
}

export function createEmptyModelLinkDraft(): ModelLinkDraft {
  return { id: nextDraftId(), kind: "website", title: "", url: "", kindEdited: false, titleEdited: false }
}

/** Applies a URL edit, filling in the kind and title until someone sets them by hand. */
export function applyModelLinkUrl(draft: ModelLinkDraft, url: string): ModelLinkDraft {
  const kind = draft.kindEdited ? draft.kind : detectModelLinkKind(url)
  const title = draft.titleEdited ? draft.title : (url.trim() ? suggestModelLinkTitle(url, kind) : "")
  return { ...draft, url, kind, title }
}

interface ModelLinksEditorProps {
  value: ModelLinkDraft[]
  onChange: (next: ModelLinkDraft[]) => void
}

export default function ModelLinksEditor({ value, onChange }: ModelLinksEditorProps) {
  const t = useTranslations("Common.ui.modelEditor")

  const update = (id: string, change: (draft: ModelLinkDraft) => ModelLinkDraft) =>
    onChange(value.map((draft) => (draft.id === id ? change(draft) : draft)))

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= value.length) return
    const next = [...value]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("linksDescription")}</p>
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noLinks")}</p>
      ) : (
        <ol className="space-y-2">
          {value.map((draft, index) => (
            <li
              key={draft.id}
              className="grid gap-2 rounded-md border p-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_10rem_auto] md:items-center"
            >
              <Input
                type="url"
                aria-label={t("linkUrl")}
                value={draft.url}
                onChange={(event) => update(draft.id, (current) => applyModelLinkUrl(current, event.target.value))}
                placeholder="https://..."
              />
              <Input
                aria-label={t("linkTitle")}
                value={draft.title}
                onChange={(event) =>
                  update(draft.id, (current) => ({ ...current, title: event.target.value, titleEdited: true }))
                }
                placeholder={t("linkTitle")}
              />
              <Select
                value={draft.kind}
                onValueChange={(kind) =>
                  update(draft.id, (current) => ({ ...current, kind: kind as ModelLinkKind, kindEdited: true }))
                }
              >
                <SelectTrigger aria-label={t("linkKind")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_LINK_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {t(`linkFields.${kind}` as never)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("moveLinkUp")}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("moveLinkDown")}
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("removeLink")}
                  onClick={() => onChange(value.filter((row) => row.id !== draft.id))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...value, createEmptyModelLinkDraft()])}
      >
        <Plus className="size-4" />
        {t("addLink")}
      </Button>
    </div>
  )
}
