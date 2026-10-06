import { expect, it } from "vite-plus/test";
import { phaseoProcessOwnership } from "./PhaseoAdapterV2.ts";

it("uses Windows tree cleanup without enabling POSIX ownership", () => {
  expect(phaseoProcessOwnership("win32")).toEqual({
    processGroupPlatform: "win32",
    ownDetachedProcessGroup: false,
    ownDescendantProcessGroups: false,
  });
});

it("supplies the host platform for Linux descendant tracking", () => {
  expect(phaseoProcessOwnership("linux")).toEqual({
    processGroupPlatform: "linux",
    ownDetachedProcessGroup: true,
    ownDescendantProcessGroups: true,
  });
  expect(phaseoProcessOwnership("darwin")).toEqual({
    processGroupPlatform: "darwin",
    ownDetachedProcessGroup: true,
    ownDescendantProcessGroups: false,
  });
});
