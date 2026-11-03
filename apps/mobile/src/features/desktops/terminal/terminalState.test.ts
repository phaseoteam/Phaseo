import { readFileSync } from "node:fs";
import path from "node:path";
import { phoneLimits } from "../protocol";
import { terminalPage } from "./terminalPage.generated";
import { appendBlock, inputChunks, pageOutput, pasteData, selectedLines, terminalContext, terminalStatus, usesTerminals, withModifier } from "./terminalState";

describe("terminal page output", () => {
  test("holds output until the page is ready, and again for a page mounted after the last went away", () => {
    const injected: string[] = [];
    const page = { injectJavaScript: (code: string) => { injected.push(code); } };
    const output = pageOutput();
    output.page(page);
    output.write("$ ");
    expect(injected).toEqual([]);
    output.loaded();
    expect(injected).toEqual(['window.phaseoTerminal.write("$ ");true;']);
    // Terminals switched off: the page unmounts. Switched on again: the replay arrives before the new page is ready.
    output.page(null);
    output.page(page);
    output.reset();
    output.write("replay");
    expect(injected).toHaveLength(1);
    output.loaded();
    expect(injected.at(-1)).toBe('window.phaseoTerminal.write("replay");true;');
    // A page that reloads in place is unready until it says otherwise.
    output.unloaded();
    output.write("more");
    expect(injected).toHaveLength(2);
  });
});

describe("terminal on the phone", () => {
  test("shows only with protocol 7, Read code and Use terminals", () => {
    expect(usesTerminals({ status: "connected", protocol: 7, capabilities: ["code", "terminal"] })).toBe(true);
    expect(usesTerminals({ status: "connected", protocol: 7, capabilities: ["code"] })).toBe(false);
    expect(usesTerminals({ status: "connected", protocol: 7, capabilities: ["terminal"] })).toBe(false);
    expect(usesTerminals({ status: "connected", protocol: 6, capabilities: ["code", "terminal"] })).toBe(false);
    expect(usesTerminals({ status: "offline", protocol: 7, capabilities: ["code", "terminal"] })).toBe(false);
  });

  test("sends Ctrl and Alt combinations as a terminal expects them", () => {
    expect(withModifier("c", "ctrl")).toBe("\u0003");
    expect(withModifier("D", "ctrl")).toBe("\u0004");
    expect(withModifier("[", "ctrl")).toBe("\u001b");
    expect(withModifier("b", "alt")).toBe("\u001bb");
    expect(withModifier("\u001b[D", "ctrl")).toBe("\u001b[1;5D");
    expect(withModifier("\u001b[A", "alt")).toBe("\u001b[1;3A");
    expect(withModifier("5", "ctrl")).toBe("5");
  });

  test("pastes lines as Enter and drops control characters that would act as keys", () => {
    expect(pasteData("git status\nls\r\n")).toBe("git status\rls\r");
    expect(pasteData("a\u0003b\u001b[2Jc\td")).toBe("a b [2Jc\td");
  });

  test("sends long input in pieces the computer takes, never splitting an emoji", () => {
    const text = `${"x".repeat(phoneLimits.terminalInputChars - 1)}🎉tail`;
    const chunks = inputChunks(text);
    expect(chunks.join("")).toBe(text);
    expect(chunks.every((chunk) => chunk.length <= phoneLimits.terminalInputChars)).toBe(true);
    expect(chunks[1]!.startsWith("🎉")).toBe(true);
  });

  test("attaches output the way the window's Add to chat does, after what's already written", () => {
    expect(terminalContext("Terminal 1", "\nerror: boom\n\n")).toBe("Output from Terminal 1:\n```text\nerror: boom\n```");
    expect(terminalContext("Build", "```x```")).toContain("````text");
    expect(appendBlock("Why does this fail?  ", "Output")).toBe("Why does this fail?\n\nOutput");
    expect(appendBlock("", "Output")).toBe("Output");
    expect(selectedLines(["a", "b", "c", "d"], 2, 0)).toBe("a\nb\nc");
  });

  test("says how a terminal ended", () => {
    expect(terminalStatus({ status: "running" })).toBe("Running");
    expect(terminalStatus({ status: "exited", exitCode: 1 })).toBe("Exited with 1");
    expect(terminalStatus({ status: "interrupted" })).toBe("Stopped when the app closed");
  });

  test("bundles the installed xterm into the page, so nothing loads from the network", () => {
    const xterm = readFileSync(path.join(path.dirname(require.resolve("@xterm/xterm/package.json")), "lib", "xterm.js"), "utf8");
    expect(terminalPage).toContain(xterm.slice(0, 2000));
    expect(terminalPage).toContain("window.phaseoTerminal");
    // Nothing the page would fetch: no script or stylesheet by address (URLs in licence comments don't load).
    expect(terminalPage).not.toMatch(/<script[^>]+src=|<link\b|@import/);
  });
});
