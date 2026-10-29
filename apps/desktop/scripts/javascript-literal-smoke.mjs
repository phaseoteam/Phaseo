import { app, BrowserWindow } from "electron";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { literalCases } from "./javascript-literal-check.mjs";
import { javascriptLiteral } from "./javascript-literal.mjs";

app.setPath("userData", mkdtempSync(path.join(tmpdir(), "phaseo-literal-check-")));
const deadline = setTimeout(() => { console.error("Literal audit timed out"); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  try {
    const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    for (const value of literalCases) {
      const source = javascriptLiteral(value);
      const html = `<script>window.injected=false;window.received=${source};</script>`;
      await window.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
      assert.equal(await window.webContents.executeJavaScript("window.injected"), false);
      assert.equal(await window.webContents.executeJavaScript("JSON.stringify(window.received)"), JSON.stringify(value));
      assert.equal(await window.webContents.executeJavaScript(`JSON.stringify(${source})`), JSON.stringify(value));
    }
    console.log("JAVASCRIPT_LITERAL_SMOKE", JSON.stringify({ cases: literalCases.length, contexts: 2, inferenceCalls: 0 }));
    window.destroy(); clearTimeout(deadline); app.quit();
  } catch (error) { console.error(error); app.exit(1); }
});
