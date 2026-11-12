import fs from "node:fs";
import path from "node:path";
import { buildLicenceData, generateLicenceData, joinCopyright, MARK, normaliseText, OUTPUT, packageText, serialise, splitCopyright, type PackageFiles } from "./collect";

const mit = (holder: string) => `MIT License\r\n\r\nCopyright (c) ${holder}\r\n\r\n\r\nPermission is hereby granted, free of charge...   \r\n`;
const pkg = (name: string, version: string, licence: string, files: PackageFiles["files"], author: string | null = null): PackageFiles => ({ name, version, licence, author, files });

describe("licence texts", () => {
  test("line endings, trailing spaces and blank runs are normalised", () => {
    expect(normaliseText("﻿\r\nA  \r\n\r\n\r\n\r\nB\r\n\r\n")).toBe("A\n\nB");
  });

  test("copyright lines come out of the text and go back where they were", () => {
    const text = normaliseText("ISC License\n\nCopyright (c) 2015 A\nCopyright (c) 2016 B\n\nPermission to use...\n\n(c) 2020 C");
    const split = splitCopyright(text);
    expect(split.blocks).toEqual(["Copyright (c) 2015 A\nCopyright (c) 2016 B", "(c) 2020 C"]);
    expect(split.template).toBe(`ISC License\n\n${MARK}\n\nPermission to use...\n\n${MARK}`);
    expect(joinCopyright(split.template, split.blocks)).toBe(text);
  });

  test("several licence files make one text, licence first and notices last", () => {
    expect(packageText([{ name: "NOTICE", text: "notice" }, { name: "LICENSE-MIT", text: "mit" }, { name: "LICENSE", text: "main" }])).toBe("LICENSE\n\nmain\n\nLICENSE-MIT\n\nmit\n\nNOTICE\n\nnotice");
    expect(packageText([{ name: "LICENSE", text: " \n" }])).toBeNull();
  });
});

describe("licence list", () => {
  const data = buildLicenceData([
    pkg("zod", "4.3.6", "MIT", [{ name: "LICENSE", text: mit("2020 Colin McDonnell") }]),
    pkg("@babel/runtime", "7.29.7", "MIT", [{ name: "LICENSE", text: mit("2014-present Sebastian McKenzie and other contributors") }]),
    pkg("clsx", "2.1.1", "MIT", [{ name: "license", text: mit("Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)") }]),
    pkg("tslib", "2.8.1", "0BSD", [], "Microsoft Corp."),
    pkg("clsx", "1.2.1", "MIT", [{ name: "license", text: mit("Luke Edwards") }]),
  ]);

  test("packages are sorted by name and version", () => {
    expect(data.packages.map(([name, version]) => `${name}@${version}`)).toEqual(["@babel/runtime@7.29.7", "clsx@1.2.1", "clsx@2.1.1", "tslib@2.8.1", "zod@4.3.6"]);
  });

  test("texts that differ only in their copyright line are stored once", () => {
    expect(data.texts).toHaveLength(1);
    const [, , licence, text, blocks] = data.packages.find(([name, version]) => name === "zod" && version === "4.3.6")!;
    expect(licence).toBe("MIT");
    expect(blocks).toEqual(["Copyright (c) 2020 Colin McDonnell"]);
    expect(joinCopyright(data.texts[text]!, blocks)).toBe(normaliseText(mit("2020 Colin McDonnell")));
  });

  test("a package without a licence file keeps its licence and author", () => {
    expect(data.packages.find(([name]) => name === "tslib")).toEqual(["tslib", "2.8.1", "0BSD", -1, [], "Microsoft Corp."]);
  });
});

describe("the shipped list", () => {
  const appDir = path.resolve(__dirname, "../..");

  test("matches the installed production dependencies (run `pnpm --filter @phaseo/mobile licences` when this fails)", () => {
    const committed = fs.readFileSync(path.join(appDir, OUTPUT), "utf8");
    expect(serialise(generateLicenceData(appDir)) === committed).toBe(true);
  }, 120_000);
});
