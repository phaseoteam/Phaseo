// Compile the exact snippets produced by the website. No provider requests.
import { createRequire } from "node:module";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sdk = path.join(root, "packages/sdk/sdk-ts");
const require = createRequire(path.join(sdk, "package.json"));
const ts = require("typescript");
const source = await readFile(path.join(root, "apps/web/src/lib/chat/sdkExport.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { sdkCode } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const cases = [
  ["/responses", { model: "test", input: "Hello", stream: false }],
  ["/responses", { model: "test", input: "Hello", stream: true }],
  ["/chat/completions", { model: "test", messages: [{ role: "user", content: "Hello" }], stream: true }],
  ["/messages", { model: "test", messages: [{ role: "user", content: "Hello" }], max_tokens: 16, stream: true }],
  ["/images/generations", { model: "test", prompt: "A tree" }],
  ["/videos", { model: "test", prompt: "A tree" }],
  ["/music/generate", { model: "test", prompt: "Piano" }],
  ["/embeddings", { model: "test", input: "A tree" }],
  ["/moderations", { model: "test", input: "A tree" }],
  ["/decisions", { model: "test", state: { text: "A tree" }, questions: {} }],
  ["/ocr", { model: "test", image: "https://example.test/tree.png" }],
  ["/rerank", { model: "test", query: "tree", documents: ["A tree"] }],
  ["/audio/speech", { model: "test", input: "Hello", voice: "alloy" }],
  ["/audio/transcriptions", { model: "test", audio_url: "https://example.test/audio.wav" }],
  ["/audio/translations", { model: "test", audio_url: "https://example.test/audio.wav" }],
];
const temp = await mkdtemp(path.join(sdk, ".room-examples-"));
try {
  const files = [];
  for (const [index, [endpoint, body]] of cases.entries()) {
    const filename = path.join(temp, `room-${index}.mts`);
    await writeFile(filename, sdkCode({ endpoint, body }, "typescript"));
    await writeFile(path.join(temp, `room-${index}.py`), sdkCode({ endpoint, body }, "python"));
    files.push(filename);
  }
  run(process.execPath, [require.resolve("typescript/bin/tsc"), "--ignoreConfig", "--rootDir", temp, "--outDir", path.join(temp, "compiled"), "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--strict", "--skipLibCheck", "--types", "node", ...files], temp);
  run(process.env.PYTHON ?? "python", ["-c", "import ast,pathlib,sys; files=list(pathlib.Path(sys.argv[1]).glob('*.py')); [ast.parse(p.read_text(encoding='utf8')) for p in files]; print(f'{len(files)} Python room exports compile')", temp], root);
  await writeFile(path.join(temp, "cases.json"), JSON.stringify(cases));
  const mockPath = path.join(temp, "mock.mjs");
  await writeFile(mockPath, `
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const [endpoint, expected] = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url)))[Number(process.env.ROOM_CASE)];
let submissions = 0;
process.env.PHASEO_API_KEY = "fixture-only";
globalThis.fetch = async (input, init = {}) => {
  const path = new URL(String(input)).pathname.replace(/^\\/v1/, "");
  if (path === "/models" && (init.method ?? "GET") === "GET") return Response.json({ models: [] });
  assert.equal(path, endpoint);
  assert.equal(init.method, "POST");
  assert.deepEqual(JSON.parse(init.body), expected);
  submissions++;
  if (endpoint === "/audio/speech") return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } });
  if (expected.stream) return new Response('data: {"type":"response.output_text.delta","delta":"ok","choices":[{"delta":{"content":"ok"}}]}\\n\\ndata: [DONE]\\n\\n', { headers: { "content-type": "text/event-stream" } });
  return Response.json({ id: "fixture_job", status: "completed", output_text: "ok" });
};
console.log = () => {};
process.on("exit", () => assert.equal(submissions, 1, "Expected exactly one paid submission"));
`);
  for (let index = 0; index < cases.length; index++) {
    run(process.execPath, ["--import", pathToFileURL(mockPath).href, path.join(temp, "compiled", `room-${index}.mjs`)], temp, { ROOM_CASE: String(index) });
  }
  const pythonRunner = `
import json, pathlib, runpy, sys, os
from unittest.mock import patch
import httpx
os.environ['PHASEO_API_KEY'] = 'fixture-only'
root = pathlib.Path(sys.argv[1])
original = httpx.AsyncClient
for index, (endpoint, expected) in enumerate(json.loads((root / 'cases.json').read_text())):
    submissions = []
    def handler(request):
        assert request.url.path.removeprefix('/v1') == endpoint
        assert request.method == 'POST'
        assert json.loads(request.content) == expected
        submissions.append(request)
        if endpoint == '/audio/speech':
            return httpx.Response(200, content=b'audio', headers={'content-type': 'audio/mpeg'})
        if expected.get('stream'):
            return httpx.Response(200, text='data: {"type":"response.output_text.delta","delta":"ok","choices":[{"delta":{"content":"ok"}}]}\\n\\ndata: [DONE]\\n\\n', headers={'content-type': 'text/event-stream'})
        return httpx.Response(200, json={'id': 'fixture_job', 'status': 'completed', 'output_text': 'ok'})
    with patch('httpx.AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs)):
        runpy.run_path(str(root / f'room-{index}.py'), run_name='__main__')
    assert len(submissions) == 1
`;
  run(process.env.PYTHON ?? "python", ["-c", pythonRunner, temp], temp, { PYTHONPATH: path.join(root, "packages/sdk/sdk-py/src") });
  console.log(`${cases.length} TypeScript room exports typecheck against the built SDK`);
  console.log(`${cases.length * 2} room exports execute with strict mocked HTTP; zero provider requests`);
} finally {
  if (path.dirname(temp) !== sdk || !path.basename(temp).startsWith(".room-examples-")) throw new Error("Unexpected temporary path");
  await rm(temp, { recursive: true, force: true });
}

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Room export verification failed (${result.status})`);
}
