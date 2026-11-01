import type { ModelRelease } from "@/lib/api/models";
import { onePerModel } from "./releases";

const event = (id: string, date: string, ...types: string[]) => ({ model: { model_id: id, name: id }, types, date }) as unknown as ModelRelease;

describe("onePerModel", () => {
  test("a model announced and released on the same day is one row, with both types", () => {
    // The live feed on 2026-10-22: Elephant-1 released at midnight and announced at 17:13.
    const rows = onePerModel([
      event("baselabs/elephant-1", "2026-10-21T17:13:48.000Z", "Announced"),
      event("baselabs/mammoth-1", "2026-10-21T17:13:48.000Z", "Announced"),
      event("baselabs/elephant-1", "2026-10-21T00:00:00.000Z", "Released"),
      event("baselabs/mammoth-1", "2026-10-21T00:00:00.000Z", "Released"),
      event("mistral/voxtral-tts-3", "2026-10-20T00:00:00.000Z", "Released", "Announced"),
    ]);
    expect(rows.map((row) => [row.model.model_id, row.date, row.types])).toEqual([
      ["baselabs/elephant-1", "2026-10-21T17:13:48.000Z", ["Announced", "Released"]],
      ["baselabs/mammoth-1", "2026-10-21T17:13:48.000Z", ["Announced", "Released"]],
      ["mistral/voxtral-tts-3", "2026-10-20T00:00:00.000Z", ["Released", "Announced"]],
    ]);
  });

  test("an earlier day's event for the same model is dropped, not merged", () => {
    const rows = onePerModel([event("a/model", "2026-10-21T09:00:00.000Z", "Released"), event("a/model", "2026-09-01T09:00:00.000Z", "Announced")]);
    expect(rows).toEqual([event("a/model", "2026-10-21T09:00:00.000Z", "Released")]);
  });
});
