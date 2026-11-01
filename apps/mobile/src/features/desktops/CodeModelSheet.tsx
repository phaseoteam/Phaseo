import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { effortRows, effortSummary, modelLabel, modelSheetRows } from "@/features/chat/modelSheetRows";
import { ModelSheet, type SheetModel } from "@/features/chat/ModelSheet";
import { rememberModel, useRecentModels } from "@/features/chat/recentModels";
import type { ModelChoice, ModelList } from "./newThread";
import type { PhoneModel } from "./protocol";

const describe = (model: PhoneModel): SheetModel => ({ id: model.id, label: model.name, detail: model.name === model.id ? null : model.id });

/** The new thread's control label: "GPT-6.1 · High", or the model alone when it has no effort levels. */
export function codeModelLabel(list: ModelList, choice: ModelChoice) {
  const model = list.models.find((entry) => entry.id === choice.model);
  return modelLabel(model?.name ?? choice.model, effortSummary(model?.efforts ?? [], model?.defaultEffort, choice.effort));
}

/**
 * The model sheet for a new thread on a computer: the models of the agent the computer would start it with, recent
 * picks on that computer first, in the computer's order after them, and the picked model's efforts.
 */
export function CodeModelSheet({ desktopId, list, choice, onChoose, open, onClose }: { desktopId: string; list: ModelList; choice: ModelChoice; onChoose(choice: ModelChoice): void; open: boolean; onClose(): void }) {
  const scope = `desktop:${desktopId}`;
  const recents = useRecentModels(scope);
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query.trim().toLocaleLowerCase());
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => {
    const byId = new Map(list.models.map((model) => [model.id, model]));
    const matching = search ? list.models.filter((model) => `${model.name} ${model.id}`.toLocaleLowerCase().includes(search)) : list.models;
    const recent = search ? [] : recents.map((id) => byId.get(id)).filter((model): model is PhoneModel => Boolean(model));
    return modelSheetRows<PhoneModel>({ pinned: recent.length ? [{ key: "recent", title: "Recent", items: recent }] : [], rest: [{ key: "models", title: search ? "Results" : "Models", items: matching }], idOf: (model) => model.id, expanded });
  }, [list.models, recents, search, expanded]);
  const model = list.models.find((entry) => entry.id === choice.model);
  const pick = useCallback((picked: PhoneModel) => {
    // Another model starts on its own default effort.
    if (picked.id !== choice.model) onChoose({ model: picked.id, effort: null });
    rememberModel(scope, picked.id);
  }, [choice.model, onChoose, scope]);
  return (
    <ModelSheet<PhoneModel>
      open={open}
      onClose={onClose}
      query={query}
      onQuery={(value) => { setQuery(value); setExpanded(false); }}
      rows={rows}
      describe={describe}
      selectedId={choice.model}
      onPick={pick}
      onShowMore={() => setExpanded(true)}
      effort={model?.efforts?.length ? { model: model.name, rows: effortRows(model.efforts, model.defaultEffort, choice.effort), onPick: (effort) => onChoose({ model: choice.model, effort }) } : null}
    />
  );
}
