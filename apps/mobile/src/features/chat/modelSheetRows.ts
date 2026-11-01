import { pickerSections, normaliseFavouriteId, type ChatModelOption, type PickerFilters } from "./modelOptions";

/**
 * The model sheet's logic, shared by Phaseo chats and Code threads: which rows it lists, the effort rows for the
 * selected model, and what the composer's model control says.
 */
export type SheetSection<T> = { key: string; title: string; items: T[] };
export type SheetRow<T> = { type: "heading"; key: string; title: string } | { type: "model"; key: string; item: T; section: string } | { type: "more"; key: string; hidden: number };

/** Rows shown before "Show more"; the pinned sections (favourites, recent) never count towards it. */
export const SHEET_LIMIT = 30;

/**
 * Pinned sections (favourites, then recent models) in full, then the rest up to `limit` models and a "Show more" row
 * for what's left, unless expanded. A model in a pinned section isn't listed again below it.
 */
export function modelSheetRows<T>({ pinned, rest, idOf, expanded = false, limit = SHEET_LIMIT }: { pinned: SheetSection<T>[]; rest: SheetSection<T>[]; idOf(item: T): string; expanded?: boolean; limit?: number }): SheetRow<T>[] {
  const rows: SheetRow<T>[] = [];
  const shown = new Set<string>();
  const add = (section: SheetSection<T>, items: T[]) => {
    if (!items.length) return;
    rows.push({ type: "heading", key: `h:${section.key}`, title: section.title });
    for (const item of items) {
      shown.add(idOf(item));
      rows.push({ type: "model", key: `${section.key}:${idOf(item)}`, item, section: section.key });
    }
  };
  for (const section of pinned) add(section, section.items.filter((item) => !shown.has(idOf(item))));
  let room = expanded ? Number.POSITIVE_INFINITY : limit;
  let hidden = 0;
  for (const section of rest) {
    const items = section.items.filter((item) => !shown.has(idOf(item)));
    const visible = items.slice(0, Math.max(0, room));
    hidden += items.length - visible.length;
    room -= visible.length;
    add(section, visible);
  }
  if (hidden) rows.push({ type: "more", key: "more", hidden });
  return rows;
}

/**
 * Phaseo chat models for the sheet: the picker's own sections (search ranking, the Free and New filters, favourites,
 * release months, coming soon), with recently used models pinned after the favourites. Searching shows one ranked list.
 */
export function chatSheetSections({ options, query, favourites, recents, filters, nowMs }: { options: ChatModelOption[]; query: string; favourites: string[]; recents: string[]; filters: PickerFilters; nowMs: number }) {
  const sections = pickerSections({ options, query, favourites, filters, nowMs });
  if (query.trim()) return { pinned: [], rest: sections };
  const byId = new Map(options.filter((option) => option.status !== "coming_soon").map((option) => [option.modelId, option]));
  const favouriteIds = new Set(favourites);
  const recent = recents.map((id) => byId.get(id)).filter((option): option is ChatModelOption => Boolean(option) && !favouriteIds.has(normaliseFavouriteId(option!.modelId)));
  const favouriteSection = sections.filter((section) => section.kind === "favourites");
  return {
    pinned: [...favouriteSection, ...(recent.length ? [{ key: "recent", title: "Recent", items: recent }] : [])],
    rest: sections.filter((section) => section.kind !== "favourites"),
  };
}

export type Effort = { id: string; label: string };
export type EffortRow = { id: string | null; label: string; isDefault: boolean; selected: boolean };

/**
 * The selected model's effort levels. Picking the model's default stores nothing (`id: null`), so the model keeps
 * following it; when the default isn't one of the levels, a "Default" row comes first. `selected` null is the default.
 */
export function effortRows(efforts: Effort[], defaultId: string | null | undefined, selected: string | null): EffortRow[] {
  if (!efforts.length) return [];
  const known = Boolean(defaultId && efforts.some((effort) => effort.id === defaultId));
  const current = selected && efforts.some((effort) => effort.id === selected) ? selected : null;
  const rows = efforts.map((effort) => {
    const isDefault = known && effort.id === defaultId;
    return { id: isDefault ? null : effort.id, label: effort.label, isDefault, selected: current ? effort.id === current : isDefault };
  });
  return known ? rows : [{ id: null, label: "Default", isDefault: true, selected: !current }, ...rows];
}

/** The effort the model runs at, in words; null when it has no levels. */
export function effortSummary(efforts: Effort[], defaultId: string | null | undefined, selected: string | null) {
  return effortRows(efforts, defaultId, selected).find((row) => row.selected)?.label ?? null;
}

/** The composer's model control: "Claude Opus 5.5 · High", the model alone without levels, "+2" for side-by-side models. */
export function modelControlLabel(model: string, effort: string | null, others = 0) {
  return `${model}${effort ? ` · ${effort}` : ""}${others > 0 ? ` +${others}` : ""}`;
}
