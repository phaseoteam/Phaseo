import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, ".tmp/java-doc-multipart");
await mkdir(output, { recursive: true });
const audio = Buffer.from([0x49, 0x44, 0x33, 0, 0xff, 0x80, 13, 10]);
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6OBsAAAAASUVORK5CYII=", "base64");
const batch = Buffer.from('{"custom_id":"local","method":"POST","url":"/v1/responses","body":{"model":"test-model","input":"Olá"}}\n');
const cases = [
  { page: "files", route: "/files", field: "file", file: "requests.jsonl", type: "application/jsonl", bytes: batch, fields: { purpose: "batch" } },
  { page: "audio-transcriptions", route: "/audio/transcriptions", field: "file", file: "audio.mp3", type: "audio/mpeg", bytes: audio, fields: { model: "openai/whisper-1" } },
  { page: "audio-translations", route: "/audio/translations", field: "file", file: "audio.mp3", type: "audio/mpeg", bytes: audio, fields: { model: "openai/whisper-1" } },
  { page: "images-edits", route: "/images/edits", field: "image", file: "input.png", type: "image/png", bytes: image, fields: { model: "openai/gpt-image-1", prompt: "Make this image warmer" } },
];
const sources = [];
for (const [index, test] of cases.entries()) {
  const snippets = [];
  for (const locale of ["", "ar", "de", "es", "fr", "hi", "ja", "pt-BR", "zh-Hans"]) {
    const file = path.join(root, "apps/docs", locale, "v1/sdk-reference/java", test.page + ".mdx");
    const contents = (await readFile(file, "utf8")).replaceAll("\r\n", "\n");
    const code = contents.match(/```java\n([\s\S]*?)```/)?.[1];
    assert.ok(code, `Missing multipart example in ${file}`);
    snippets.push(code);
  }
  assert.ok(snippets.every(code => code === snippets[0]), `${test.page}: translated examples must match English`);
  const code = snippets[0];
  assert.ok(code.includes('System.getenv().getOrDefault("PHASEO_BASE_URL", "https://api.phaseo.app/v1")'));
  const imports = code.split("\n").filter(line => line.startsWith("import "));
  const body = code.split("\n").filter(line => !line.startsWith("import ")).join("\n");
  test.className = `JavaMultipart${index}`;
  const source = path.join(output, test.className + ".java");
  await writeFile(source, `${imports.join("\n")}\npublic class ${test.className} { public static void main(String[] args) throws Exception {\n${body}\n} }`);
  await writeFile(path.join(output, test.file), test.bytes);
  sources.push(source);
}
const executable = name => process.env.JAVA_HOME
  ? path.join(process.env.JAVA_HOME, "bin", name + (process.platform === "win32" ? ".exe" : ""))
  : name;
const compiled = spawnSync(executable("javac"), ["-J-Xmx256m", "-encoding", "UTF-8", "--release", "17", "-d", output, ...sources], { stdio: "inherit" });
if (compiled.error) throw compiled.error;
assert.equal(compiled.status, 0, "Multipart examples must compile on Java 17+");

let current;
const server = createServer(async (request, response) => {
  current.requests++;
  try {
    const test = current.test;
    assert.equal(request.url, "/v1" + test.route);
    assert.equal(request.method, "POST");
    assert.equal(request.headers.authorization, "Bearer local-multipart-test");
    assert.match(request.headers["content-type"], /^multipart\/form-data; boundary=phaseo-/);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers["content-type"] } }).formData();
    assert.deepEqual([...form.keys()].sort(), [...Object.keys(test.fields), test.field].sort());
    for (const [key, value] of Object.entries(test.fields)) assert.equal(form.get(key), value);
    const file = form.get(test.field);
    assert.equal(file.name, test.file);
    assert.equal(file.type, test.type);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), test.bytes);
    response.writeHead(current.status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(current.status === 401 ? { error: "local denial" } : { id: "local_upload", text: "local response" }));
  } catch (error) {
    current.error = error;
    response.writeHead(422, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: error.message }));
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
try {
  for (const test of cases) {
    for (const status of [200, 401]) {
      current = { test, status, requests: 0 };
      const child = spawn(executable("java"), ["-Xmx128m", "-cp", output, test.className], {
        cwd: output,
        env: { ...process.env, PHASEO_API_KEY: "local-multipart-test", PHASEO_BASE_URL: `http://127.0.0.1:${server.address().port}/v1///` },
        timeout: 20000,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", chunk => { stdout += chunk; });
      child.stderr.on("data", chunk => { stderr += chunk; });
      const [exitCode] = await once(child, "close");
      assert.ifError(current.error);
      assert.equal(current.requests, 1, `${test.page}: request must reach only the local fixture once`);
      if (status === 200) {
        assert.equal(exitCode, 0, stderr);
        assert.match(stdout, /local_upload/);
      } else {
        assert.notEqual(exitCode, 0);
        assert.match(stderr, /HTTP 401/);
        assert.match(stderr, /local denial/);
      }
    }
    console.log(`${test.page}: multipart fields, file bytes, auth, and HTTP errors verified`);
  }
} finally {
  server.close();
  await once(server, "close");
}
console.log("All four multipart examples match across nine locales and pass eight local HTTP checks");
