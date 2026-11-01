import { detectSlashTrigger, filterCommands, removeTrigger } from "./commands";

const commands = [
  { id: "model", label: "/model", description: "Choose the model and its effort" },
  { id: "compare", label: "/compare", description: "Add models to answer side by side" },
  { id: "settings", label: "/settings", description: "This model's settings in the chat" },
  { id: "usage", label: "/usage", description: "Credit balance and recent spend" },
];

describe("detectSlashTrigger", () => {
  it("finds the /word the caret is in at a line start or after a space", () => {
    expect(detectSlashTrigger("/mo", 3)).toEqual({ query: "mo", rangeStart: 0, rangeEnd: 3 });
    expect(detectSlashTrigger("hello /us", 9)).toEqual({ query: "us", rangeStart: 6, rangeEnd: 9 });
    expect(detectSlashTrigger("first\n/", 7)).toEqual({ query: "", rangeStart: 6, rangeEnd: 7 });
  });

  it("ignores slashes inside words, paths and text away from the caret", () => {
    expect(detectSlashTrigger("and/or", 6)).toBeNull();
    expect(detectSlashTrigger("/usr/bin", 4)).toBeNull();
    expect(detectSlashTrigger("/model then more", 16)).toBeNull();
  });
});

describe("filterCommands", () => {
  it("lists every command for a bare slash, in order", () => {
    expect(filterCommands(commands, "").map((command) => command.id)).toEqual(["model", "compare", "settings", "usage"]);
  });

  it("puts names starting with the query before names containing it", () => {
    expect(filterCommands(commands, "s").map((command) => command.id)).toEqual(["settings", "usage"]);
    expect(filterCommands(commands, "MO").map((command) => command.id)).toEqual(["model"]);
    expect(filterCommands(commands, "zz")).toEqual([]);
  });
});

describe("removeTrigger", () => {
  it("takes the typed command out of the draft and leaves the caret where it was", () => {
    expect(removeTrigger("/usa", { query: "usa", rangeStart: 0, rangeEnd: 4 })).toEqual({ value: "", cursor: 0 });
    expect(removeTrigger("Explain /mod this", { query: "mod", rangeStart: 8, rangeEnd: 12 })).toEqual({ value: "Explain this", cursor: 8 });
  });
});
