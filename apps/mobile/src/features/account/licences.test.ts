import { joinCopyright, MARK } from "../../../scripts/licences/collect";
import { findLicence, licenceName, licencePackages, licenceSections, licenceText, reflowLicence, shownCopyright, type Licence } from "./licences";

const entry = (overrides: Partial<Licence>): Licence => ({ name: "pkg", version: "1.0.0", licence: "MIT", text: 0, copyright: [], author: null, ...overrides });

describe("shipped licences", () => {
  test("every package's text rebuilds the same way as the generator joins it", () => {
    const texts = [`MIT License\n\n${MARK}\n\nPermission is hereby granted...\n\n${MARK}`];
    const pkg = entry({ copyright: ["Copyright (c) 2020 A", "Copyright [yyyy] [name of copyright owner]"] });
    expect(licenceText(pkg, texts)).toBe(joinCopyright(texts[0]!, pkg.copyright));
    expect(licenceText(entry({ text: -1 }), texts)).toBeNull();
  });

  test("copyright shows holders, not licence templates, and falls back to the author", () => {
    expect(shownCopyright(entry({ copyright: ["Copyright (c) 2020 A\nCopyright (c) 2020 A", "Copyright [yyyy] [name of copyright owner]"] }))).toBe("Copyright (c) 2020 A");
    expect(shownCopyright(entry({ author: "Jane" }))).toBe("Author: Jane");
    expect(shownCopyright(entry({}))).toBeNull();
  });

  test("groups by licence, most used first, and searches names, licences and holders", () => {
    const packages = [entry({ name: "a" }), entry({ name: "b" }), entry({ name: "c", licence: "ISC", copyright: ["Copyright (c) Isaac"] })];
    expect(licenceSections(packages).map((section) => [section.licence, section.packages.length])).toEqual([["MIT", 2], ["ISC", 1]]);
    expect(licenceSections(packages, "isaac").map((section) => section.packages.map((pkg) => pkg.name))).toEqual([["c"]]);
    expect(licenceSections(packages, "zzz")).toEqual([]);
  });

  test("plain paragraphs are rejoined for a phone screen; lists and indented layouts keep their lines", () => {
    const list = ["1. Redistributions of source code must retain", "   the above copyright notice."].join("\n");
    const item = ["  (a) You must give", "      recipients a copy"].join("\n");
    const text = [
      "MIT License",
      "Permission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files.",
      "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY\nOF ANY KIND.",
      list,
      "      \"License\" shall mean the terms\n      and conditions.",
      item,
    ].join("\n\n");
    expect(reflowLicence(text).split("\n\n")).toEqual([
      "MIT License",
      "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files.",
      "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND.",
      list,
      "\"License\" shall mean the terms and conditions.",
      item,
    ]);
  });

  test("the generated list loads and includes the app's own dependencies with their texts", () => {
    const packages = licencePackages();
    expect(packages.length).toBeGreaterThan(100);
    const react = packages.find((pkg) => pkg.name === "react")!;
    expect(react.licence).toBe("MIT");
    expect(licenceText(react)).toContain("Permission is hereby granted");
    expect(findLicence(react.name, react.version)).toBe(react);
    expect(licenceName("(MIT OR Apache-2.0)")).toBe("MIT or Apache-2.0");
  });
});
