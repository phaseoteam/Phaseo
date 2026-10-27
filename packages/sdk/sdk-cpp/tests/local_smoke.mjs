import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const requests = [];
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  requests.push({ path: request.url, method: request.method, authorization: request.headers.authorization, body: JSON.parse(body) });
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ id: "local-smoke", choices: [{ message: { content: "Hello" } }], output: [] }));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
try {
  assert.equal(process.argv.length, 4, "Pass the compiled chat and Responses smoke binaries");
  for (const executable of process.argv.slice(2)) {
    const child = spawn(executable, [], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: { ...process.env, PHASEO_API_KEY: "local-test-key", PHASEO_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, PHASEO_SMOKE_MODEL: "test-model", PHASEO_SMOKE_INPUT: "Hi" },
      stdio: "inherit",
      timeout: 5000,
    });
    const [status] = await once(child, "exit");
    assert.equal(status, 0, "C++ curl example must complete against the local fixture");
  }
  assert.deepEqual(requests.map(request => request.path), ["/v1/chat/completions", "/v1/responses"]);
  for (const request of requests) {
    assert.equal(request.method, "POST");
    assert.equal(request.authorization, "Bearer local-test-key");
    assert.equal(request.body.model, "test-model");
  }
  assert.equal(requests[0].body.messages[0].content, "Hi");
  assert.equal(requests[1].body.input, "Hi");
  console.log("C++ curl examples pass local HTTP smoke checks (not streaming)");
} finally {
  server.close();
  await once(server, "close");
}
