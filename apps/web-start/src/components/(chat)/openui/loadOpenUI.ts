// Keep the package's auto-mounted CDN devtools out of this experiment.
// Its development bootstrap checks this documented-in-source symbol.
export function disableOpenUIAutoDevtools() {
  (globalThis as typeof globalThis & { [key: symbol]: unknown })[
    Symbol.for("openui.devtools.autoMount")
  ] = true;
}

export function loadOpenUILibrary() {
  disableOpenUIAutoDevtools();
  return import("./openuiLibrary");
}
