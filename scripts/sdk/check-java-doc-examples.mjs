import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildJavaSdkQuickstart } from "../../apps/web/src/components/(data)/model/quickstart/javaSdkQuickstart.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sdk = path.join(root, "packages/sdk/sdk-java");
const output = path.join(root, ".tmp/java-doc-examples");
await mkdir(output, { recursive: true });
const classpath = [path.join(sdk, "target/classes"), (await readFile(path.join(sdk, "target/example-classpath.txt"), "utf8")).trim()].join(path.delimiter);
const snippets = new Set();
for (const locale of ["", "ar", "de", "es", "fr", "hi", "ja", "pt-BR", "zh-Hans"]) {
  const docs = path.join(root, "apps/docs", locale, "v1");
  const directory = path.join(docs, "sdk-reference/java");
  const files = (await readdir(directory)).filter(file => file.endsWith(".mdx") && !file.startsWith("agent-"));
  for (const file of [...files.map(file => path.join(directory, file)), path.join(docs, "quickstart.mdx")]) {
    const contents = await readFile(file, "utf8");
    const examples = [...contents.matchAll(/```java(?:[ \t][^\n]*)?\r?\n([\s\S]*?)```/g)].map(match => match[1]);
    if (file.endsWith("quickstart.mdx")) assert.ok(examples.length > 0, `${locale || "en"} quickstart needs a Java tab`);
    for (const example of examples) snippets.add(example.trim());
  }
}
for (const request of [
  { path: "/responses", payloadJson: JSON.stringify({ model: "test-model", input: "Hello \"Java\"\n世界" }), streaming: false },
  { path: "/chat/completions", payloadJson: JSON.stringify({ model: "test-model", stream: true, messages: [{ role: "user", content: "Hello" }] }), streaming: true },
  { path: "/models", payloadJson: "{}", streaming: false, modelId: "test-model" },
]) snippets.add(buildJavaSdkQuickstart(request).trim());

const files = [];
for (const [index, example] of [...snippets].entries()) {
  const name = `JavaExample${index}`;
  let source;
  if (/public (?:final )?class Main\b/.test(example)) {
    source = example.replace(/\bMain\b/g, name);
  } else {
    const imports = example.split("\n").filter(line => line.startsWith("import "));
    const body = example.split("\n").filter(line => !line.startsWith("import ")).join("\n");
    source = `${imports.join("\n")}\npublic class ${name} { public static void main(String[] args) throws Exception {\n${body}\n} }`;
  }
  const file = path.join(output, name + ".java");
  await writeFile(file, source);
  files.push(file);
}
const javac = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "javac.exe" : "javac") : "javac";
const result = spawnSync(javac, ["-J-Xmx256m", "-encoding", "UTF-8", "--release", "17", "-classpath", classpath, "-d", output, ...files], { stdio: "inherit" });
if (result.error) throw result.error;
assert.equal(result.status, 0, "Java documentation examples must compile");
console.log(`${files.length} distinct Java examples compile across all nine locales and web quickstarts`);
