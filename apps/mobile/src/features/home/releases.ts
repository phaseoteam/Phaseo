import type { ModelRelease } from "@/lib/api/models";

/**
 * One row per model, at its newest event (the feed is newest first). The feed lists a model's events
 * separately when their times differ, so a model released at midnight and announced that afternoon
 * came twice. Events from the same UTC day merge their types, so the row can read "Released".
 */
export function onePerModel(releases: ModelRelease[]): ModelRelease[] {
  const rows = new Map<string, ModelRelease>();
  for (const release of releases) {
    const id = release.model.model_id;
    const row = rows.get(id);
    if (!row) rows.set(id, release);
    else if (row.date.slice(0, 10) === release.date.slice(0, 10)) rows.set(id, { ...row, types: [...new Set([...row.types, ...release.types])] });
  }
  return [...rows.values()];
}
