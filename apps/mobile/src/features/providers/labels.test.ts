import { regionsLabel, trainingLabel } from "./labels";

describe("trainingLabel", () => {
  it("describes each policy the catalogue uses", () => {
    expect(trainingLabel("no_train")).toBe("Does not train on prompts");
    expect(trainingLabel("opt_out_available")).toBe("May train (opt-out available)");
    expect(trainingLabel("may_train")).toBe("May train on prompts");
    expect(trainingLabel(null)).toBe("No clear public training policy");
    expect(trainingLabel("something_new")).toBe("No clear public training policy");
  });
});

describe("regionsLabel", () => {
  it("names known regions, keeps others readable and drops repeats", () => {
    expect(regionsLabel(["GLOBAL", "us"])).toBe("Global, US");
    expect(regionsLabel(["us", "US", "eu-north1"])).toBe("US, EU-NORTH1");
    expect(regionsLabel([])).toBeUndefined();
  });
});
