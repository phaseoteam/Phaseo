/**
 * Guards for code that runs on the UI thread. The worklets Babel plugin copies each worklet's source to the UI
 * runtime and hands it the module values it uses through `this.__closure`, which the copy unpacks at the top of its
 * body. A default parameter runs before the body, so `function f(x, max = MAX)` throws "Property 'MAX' doesn't
 * exist" on the UI thread even though `MAX` is captured (the version art crashed this way when a logo was flung).
 * The rule: worklets never use default parameters that refer to other values; pass them in, or read the constant in
 * the body.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import ts from "typescript";
import * as floating from "./features/account/floating";

const ROOT = path.resolve(__dirname, "..");
const SOURCES = ["src", "app"].flatMap((dir) => listSources(path.join(ROOT, dir)));

function listSources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSources(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const relative = (file: string) => path.relative(ROOT, file).replace(/\\/g, "/");
const read = (file: string) => fs.readFileSync(file, "utf8");
/** Files that hold worklets: an explicit directive, or a Reanimated or Gesture Handler hook whose callbacks become worklets. */
const WORKLET_FILES = SOURCES.filter((file) => /["']worklet["']|from "react-native-(reanimated|gesture-handler)"/.test(read(file)));

describe("worklet sources", () => {
  it("finds the files that run code on the UI thread", () => {
    expect(WORKLET_FILES.map(relative)).toEqual(expect.arrayContaining(["src/features/account/floating.ts", "src/features/account/VersionArtScreen.tsx"]));
  });

  it("never give a \"worklet\" function a default parameter that refers to another value", () => {
    const found: string[] = [];
    for (const file of SOURCES) {
      const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node: ts.Node) => {
        if (ts.isFunctionLike(node) && "body" in node) {
          if (isWorkletBody(node.body)) {
            for (const parameter of node.parameters) {
              if (parameter.initializer && refersToValue(parameter.initializer)) {
                const { line } = source.getLineAndCharacterOfPosition(parameter.getStart());
                found.push(`${relative(file)}:${line + 1} ${parameter.getText()}`);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(found).toEqual([]);
  });
});

const isWorkletBody = (body: ts.Node | undefined) => {
  const first = body && ts.isBlock(body) ? body.statements[0] : undefined;
  return Boolean(first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "worklet");
};

/** A file's top-level functions (true when they're worklets) and what it imports from where. */
function topLevel(file: string) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const functions = new Map<string, boolean>();
  const imports = new Map<string, string>();
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) functions.set(statement.name.text, isWorkletBody(statement.body));
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (ts.isIdentifier(declaration.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) functions.set(declaration.name.text, isWorkletBody(init.body));
      }
    }
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) imports.set(element.name.text, statement.moduleSpecifier.text);
    }
  }
  return { functions, imports };
}

function refersToValue(node: ts.Node): boolean {
  if (ts.isIdentifier(node)) return true;
  return ts.forEachChild(node, (child) => (refersToValue(child) ? true : undefined)) ?? false;
}

// --- What the plugin actually emits -----------------------------------------------------------------------------

/** The parts of @babel/core used here (it isn't a direct dependency, so it has no types in this package). */
type Babel = {
  transformSync(code: string, options: object): { code?: string | null } | null;
  parseSync(code: string, options: object): { program: { body: unknown[] } } | null;
  traverse(ast: unknown, visitors: { ObjectProperty(path: { node: { key: { type: string; name?: string }; value: { type: string; value?: unknown } } }): void }): void;
};
type Compiled = { name: string; code: string; params: string[]; closure: string[]; defaults: string[] };

// The project's own preset (Expo's, which adds the worklets plugin), resolved through expo as Metro does.
const presetPath = require.resolve("babel-preset-expo", { paths: [path.dirname(require.resolve("expo/package.json"))] });
const babel = jest.requireActual<Babel>(require.resolve("@babel/core", { paths: [path.dirname(presetPath)] }));

/** Every worklet the plugin emits for a file: its UI-thread source, its parameters and what it captures. */
function compileWorklets(file: string): Compiled[] {
  const output = babel.transformSync(read(file), {
    filename: file,
    cwd: ROOT,
    babelrc: false,
    configFile: false,
    presets: [presetPath],
    caller: { name: "metro", bundler: "metro", platform: "android", isDev: false } as never,
  });
  const ast = babel.parseSync(output?.code ?? "", { babelrc: false, configFile: false, sourceType: "script" });
  const codes: string[] = [];
  babel.traverse(ast!, {
    ObjectProperty(property) {
      const { key, value } = property.node;
      if (key.type === "Identifier" && key.name === "code" && value.type === "StringLiteral" && typeof value.value === "string" && value.value.startsWith("(function")) codes.push(value.value);
    },
  });
  return codes.map((code) => {
    const fn = (babel.parseSync(code, { babelrc: false, configFile: false, sourceType: "script" })!.program.body[0] as unknown as { expression: WorkletNode }).expression;
    const text = (node: Located) => code.slice(node.start ?? 0, node.end ?? 0);
    // The plugin unpacks the captured values first: `const [a, b] = this.__closure;`.
    const declaration = fn.body.body[0]?.declarations?.[0];
    const closure = declaration?.init?.property?.name === "__closure" ? (declaration.id.elements ?? []).flatMap((element) => (element?.name ? [element.name] : [])) : [];
    const defaults = fn.params.filter((param) => param.type === "AssignmentPattern").map(text);
    return { name: fn.id?.name ?? "anonymous", code, params: fn.params.map(text), closure, defaults };
  });
}

/** Just enough of a parsed worklet for the checks above. */
type Located = { type: string; start?: number | null; end?: number | null };
type WorkletNode = {
  id?: { name: string } | null;
  params: Located[];
  body: { body: { declarations?: { id: { elements?: ({ name?: string } | null)[] }; init?: { property?: { name?: string } } | null }[] }[] };
};

describe("compiled worklets", () => {
  const compiled = new Map(WORKLET_FILES.map((file) => [relative(file), compileWorklets(file)]));

  it("compiles the version art's worklets", () => {
    expect(compiled.get("src/features/account/floating.ts")!.length).toBeGreaterThan(5);
    expect(compiled.get("src/features/account/VersionArtScreen.tsx")!.length).toBeGreaterThan(3);
  });

  it("have no default parameters that read a captured value on the UI thread", () => {
    const found = [...compiled].flatMap(([file, worklets]) => worklets.flatMap((worklet) => worklet.defaults.filter((text) => /=\s*[A-Za-z_$]/.test(text)).map((text) => `${file} ${worklet.name}(${text})`)));
    expect(found).toEqual([]);
  });

  it("only call worklets: the file's own plain functions are passed to scheduleOnRN, never called", () => {
    const found: string[] = [];
    for (const [file, worklets] of compiled) {
      const own = topLevel(path.join(ROOT, file));
      for (const worklet of worklets) {
        for (const name of worklet.closure) {
          const local = own.functions.get(name);
          if (local === false && new RegExp(`\\b${name}\\(`).test(worklet.code)) found.push(`${file} ${worklet.name} calls ${name}`);
          const from = own.imports.get(name);
          if (!from?.startsWith(".")) continue;
          const target = WORKLET_FILES.find((candidate) => candidate.replace(/\.tsx?$/, "") === path.resolve(path.dirname(path.join(ROOT, file)), from));
          if (!target) continue;
          const theirs = topLevel(target);
          if (theirs.functions.get(name) === false) found.push(`${file} ${worklet.name} captures ${name} from ${from}, which isn't a worklet`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("read the fling cap from the closure, inside the body", () => {
    const fling = compiled.get("src/features/account/floating.ts")!.find((worklet) => worklet.name.startsWith("fling_"));
    expect(fling?.closure).toContain("MAX_SPEED");
    expect(fling?.params.join(",")).not.toContain("MAX_SPEED");
  });

  it("run on a bare runtime with nothing but their closure, as on the UI thread", () => {
    const ui = uiRuntime(compiled.get("src/features/account/floating.ts")!);
    // Every exported function is a worklet the UI thread can rebuild.
    expect(Object.keys(ui)).toEqual(expect.arrayContaining(Object.keys(floating).filter((key) => typeof (floating as Record<string, unknown>)[key] === "function")));
    for (const sample of SAMPLES) expect(sample(ui)).toEqual(sample(floating));
  });
});

/** Calls to replay on the bare runtime, compared with the same call on the JS thread. */
const SAMPLES: ((api: typeof floating) => unknown)[] = [
  (api) => api.fling(6000, 8000),
  (api) => api.fling(30, 40),
  (api) => api.limitSpeed(300, 400, 100),
  (api) => api.dragTo({ x: 300, y: 40 }, { x: 200, y: 0 }, { x: 340, y: 40 }, 50, { left: 0, top: 0, right: 400, bottom: 800 }, { left: 100, top: 300, right: 300, bottom: 500 }),
  (api) => api.ringLayout(8, 48, { left: 8, top: 40, right: 404, bottom: 860 }, { left: 70, top: 280, right: 342, bottom: 620 }),
];

/**
 * The file's worklets rebuilt from the plugin's UI-thread source in an empty context, each bound to its closure:
 * other worklets from the file (rebuilt the same way) or the module's exported values. A worklet that captures a plain
 * function, or a value the module doesn't export, fails here, as calling it would on the device.
 */
function uiRuntime(worklets: Compiled[]): typeof floating {
  type Fn = (...args: unknown[]) => unknown;
  const context = vm.createContext({});
  const byName = new Map(worklets.map((worklet) => [worklet.name.replace(/_[A-Za-z]+Ts\d+$/, ""), worklet]));
  const built = new Map<string, Fn>();
  const module = floating as unknown as Record<string, unknown>;
  const build = (name: string): Fn => {
    const existing = built.get(name);
    if (existing) return existing;
    const worklet = byName.get(name);
    if (!worklet) throw new Error(`${name} isn't a worklet`);
    let bound: Fn | null = null;
    // Late-bound, so worklets that call each other resolve whichever is built first.
    const call: Fn = (...args) => bound!(...args);
    built.set(name, call);
    const closure = worklet.closure.map((captured) => {
      if (byName.has(captured)) return build(captured);
      const value = module[captured];
      if (typeof value === "function") throw new Error(`${name} calls ${captured}, which isn't a worklet`);
      if (value === undefined) throw new Error(`${name} captures ${captured}, which the UI thread can't be given`);
      return value;
    });
    const fn = vm.runInContext(worklet.code, context) as Fn;
    bound = fn.bind({ __closure: closure });
    return call;
  };
  return Object.fromEntries([...byName.keys()].map((name) => [name, build(name)])) as unknown as typeof floating;
}
