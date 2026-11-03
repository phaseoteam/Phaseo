/* global Terminal, FitAddon */
// Runs inside the terminal's WebView, after xterm.js. The app writes with window.phaseoTerminal.*; the page answers
// through ReactNativeWebView.postMessage. The phone never resizes the computer's terminal: xterm fits the phone's
// width and wraps what the computer writes.
(function () {
  function post(message) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message)); }
  const term = new Terminal({ cursorBlink: true, fontFamily: "monospace", fontSize: 12, lineHeight: 1.15, scrollback: 5000 });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(document.getElementById("terminal"));
  function size() { try { fit.fit(); } catch { /* Not laid out yet. */ } }
  window.addEventListener("resize", size);
  term.onData(function (data) { post({ type: "input", data: data }); });
  window.phaseoTerminal = {
    write: function (data) { term.write(data); },
    reset: function () { term.reset(); },
    theme: function (theme) { term.options.theme = theme; document.body.style.background = theme.background; },
    focus: function () { term.focus(); },
    blur: function () { term.blur(); },
    /** The latest `count` lines as plain text, a line the terminal wrapped joined back up, for Attach output. */
    lines: function (count) {
      const buffer = term.buffer.active, lines = [];
      for (let index = Math.max(0, buffer.length - count * 4); index < buffer.length; index++) {
        const line = buffer.getLine(index);
        if (!line) continue;
        const text = line.translateToString(true);
        if (line.isWrapped && lines.length) lines[lines.length - 1] += text; else lines.push(text);
      }
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      post({ type: "lines", lines: lines.slice(-count) });
    },
  };
  size();
  post({ type: "ready" });
})();
