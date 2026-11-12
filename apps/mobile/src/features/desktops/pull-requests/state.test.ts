import { failedRead } from "./state";

type List = { key: string; repository: string | null; rows: { number: number }[] | null; cursor?: string; limitReached: boolean; error: { message: string } | null; loading: boolean };

describe("pull request reads", () => {
  const empty = { repository: null, rows: null, cursor: undefined, limitReached: false };
  const loaded: List = { key: "a", repository: "phaseo/a", rows: [{ number: 1 }], cursor: "c1", limitReached: false, error: null, loading: true };

  it("keeps the shown rows when a refresh of the same repository fails", () => {
    expect(failedRead(loaded, "a", empty, { message: "offline" })).toMatchObject({ key: "a", repository: "phaseo/a", rows: [{ number: 1 }], error: { message: "offline" }, loading: false });
  });

  it("drops another repository's rows when switching to one that fails, so its error shows", () => {
    expect(failedRead(loaded, "b", empty, { message: "No origin remote" })).toEqual({ key: "b", ...empty, error: { message: "No origin remote" }, loading: false });
  });
});
