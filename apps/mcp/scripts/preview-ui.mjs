import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const result = await build({
  entryPoints: ["ui/preview.ts"],
  bundle: true,
  write: false,
  format: "esm",
  target: "es2022",
});
createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.url === "/preview.js") {
    response.setHeader("Content-Type", "text/javascript");
    response.end(result.outputFiles[0].text);
  } else if (request.url === "/explorer") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(await readFile("dist/ui/index.html", "utf8"));
  } else {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(
      '<!doctype html><html lang="en"><title>Phaseo UI fixture preview</title><style>body{margin:0;font:13px system-ui}nav{padding:10px 20px;background:#e8eddf;display:flex;justify-content:space-between}iframe{border:0;width:100%;height:calc(100vh - 45px)}</style><nav>Development preview · fixture data<button id="theme">Toggle theme</button></nav><iframe title="Phaseo explorer"></iframe><script type="module" src="/preview.js"></script></html>',
    );
  }
}).listen(4318, "127.0.0.1", () =>
  console.log("Phaseo fixture preview: http://127.0.0.1:4318"),
);
